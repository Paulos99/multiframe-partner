#!/usr/bin/env python3
"""Minimal Cloud Function version bump via DoH + curl --resolve (Windows TLS workaround)."""
from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from function_bundle import build_function_zip

FOLDER_ID = "b1gibd821or94p6f9v1q"
SA_ID = "aje4r8khao2t9nl9dp8e"
FUNC_NAME = "multiframe-partner-api"
ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
KEY_PATH = Path.home() / ".yc" / "agent-project-creator-key.json"
STORAGE_PATH = Path.home() / ".yc" / "partner-storage.json"
DOH = "https://cloudflare-dns.com/dns-query"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def doh_a(name: str) -> str:
    out = subprocess.check_output(
        [
            "curl.exe",
            "-sS",
            f"{DOH}?name={name}&type=A",
            "-H",
            "accept: application/dns-json",
        ],
        text=True,
    )
    data = json.loads(out)
    for ans in data.get("Answer") or []:
        if ans.get("type") == 1:
            return ans["data"]
    raise SystemExit(f"DoH: no A record for {name}: {data}")


def curl_json(method: str, url: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    host = urlparse(url).hostname or ""
    ip = doh_a(host)
    resolve = f"{host}:443:{ip}"
    data_file = None
    if body is not None:
        data_file = Path(__file__).with_suffix(".req.json")
        data_file.write_text(json.dumps(body), encoding="utf-8")

    last_err = ""
    for attempt in range(1, 12):
        cmd = [
            "curl.exe",
            "-sS",
            "--resolve",
            resolve,
            "-w",
            "\n__HTTP__%{http_code}",
            "-X",
            method,
            url,
            "-H",
            "Content-Type: application/json",
        ]
        if token:
            cmd += ["-H", f"Authorization: Bearer {token}"]
        if data_file:
            cmd += ["-d", f"@{data_file}"]
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        out = proc.stdout or ""
        err = (proc.stderr or "").strip()
        if proc.returncode != 0:
            last_err = err or f"curl exit {proc.returncode}"
            if "SSL/TLS" in last_err or "schannel" in last_err:
                time.sleep(min(2 * attempt, 8))
                continue
            break
        if "__HTTP__" in out:
            raw, _, code_s = out.rpartition("\n__HTTP__")
            status = int(code_s.strip() or "0")
        else:
            raw, status = out, 200
        if data_file and data_file.is_file():
            data_file.unlink(missing_ok=True)
        raw = raw.strip()
        if not raw:
            return status, {}
        try:
            return status, json.loads(raw)
        except json.JSONDecodeError:
            return status, {"raw": raw}

    if data_file and data_file.is_file():
        data_file.unlink(missing_ok=True)
    raise SystemExit(f"curl failed for {url}: {last_err}")


def iam_token(keydata: dict) -> str:
    pem = keydata["private_key"]
    if "BEGIN PRIVATE KEY" in pem and not pem.strip().startswith("-----"):
        pem = pem[pem.index("-----BEGIN") :]
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    now = int(time.time())
    header = b64url(
        json.dumps({"alg": "PS256", "typ": "JWT", "kid": keydata["id"]}, separators=(",", ":")).encode()
    )
    payload = b64url(
        json.dumps(
            {
                "iss": keydata["service_account_id"],
                "aud": "https://iam.api.cloud.yandex.net/iam/v1/tokens",
                "iat": now,
                "exp": now + 3600,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing = f"{header}.{payload}".encode()
    sig = key.sign(
        signing,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256(),
    )
    jwt = f"{header}.{payload}.{b64url(sig)}"
    _, resp = curl_json("POST", "https://iam.api.cloud.yandex.net/iam/v1/tokens", body={"jwt": jwt})
    token = resp.get("iamToken")
    if not token:
        raise SystemExit(f"IAM failed: {resp}")
    return token


def wait_op(token: str, op: dict, timeout=420) -> dict:
    op_id = op.get("id")
    if not op_id:
        return op
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, st = curl_json("GET", f"https://operation.api.cloud.yandex.net/operations/{op_id}", token)
        if st.get("done"):
            if "error" in st:
                raise SystemExit(f"Operation failed: {st['error']}")
            return st.get("response") or st
        time.sleep(2)
    raise SystemExit("Operation timeout")


def make_zip():
    zip_path = API_DIR / "function.zip"
    bundle = build_function_zip(zip_path, include_node_modules=True)
    print("zip bytes", zip_path.stat().st_size, "entrypoint", bundle.entrypoint)
    print("bundle:", ", ".join(bundle.api_files))
    if bundle.outside_api:
        print("outside apps/api:", ", ".join(bundle.outside_api))
    return bundle


def load_storage_env() -> dict[str, str]:
    if not STORAGE_PATH.is_file():
        return {}
    data = json.loads(STORAGE_PATH.read_text(encoding="utf-8"))
    bucket = data.get("PARTNERS_BUCKET") or ""
    access = data.get("YC_ACCESS_KEY_ID") or ""
    secret = data.get("YC_SECRET_ACCESS_KEY") or ""
    if not (bucket and access and secret):
        return {}
    return {
        "PARTNERS_BUCKET": bucket,
        "YC_ACCESS_KEY_ID": access,
        "YC_SECRET_ACCESS_KEY": secret,
        "YC_REGION": data.get("YC_REGION") or "ru-central1",
        "PLATFORM_KEY": "platform-v2.json",
    }


def find_function_id(token: str) -> str:
    _, listing = curl_json(
        "GET",
        f"https://serverless-functions.api.cloud.yandex.net/functions/v1/functions?folderId={FOLDER_ID}",
        token,
    )
    for f in listing.get("functions") or []:
        if f.get("name") == FUNC_NAME:
            return f["id"]
    raise SystemExit(f"Function {FUNC_NAME} not found")


def create_version(
    token: str, function_id: str, zip_path: Path, storage_env: dict[str, str], entrypoint: str
) -> str:
    content = base64.b64encode(zip_path.read_bytes()).decode()
    jwt_secret = hashlib.sha256(f"mf-partner-{FOLDER_ID}-{SA_ID}".encode()).hexdigest()
    environment = {
        "JWT_SECRET": jwt_secret,
        "CORS_ORIGIN": "*",
        "ANALYTICS_KEY": "analytics-events.json",
        "ANALYTICS_ADMIN_KEY": "admin1234",
        "PLATFORM_KEY": "platform-v2.json",
        "DEPLOY_BUST": str(int(time.time())),
        **storage_env,
    }
    print("creating version, env keys:", sorted(environment.keys()))
    _, op = curl_json(
        "POST",
        "https://serverless-functions.api.cloud.yandex.net/functions/v1/versions",
        token,
        {
            "functionId": function_id,
            "runtime": "nodejs22",
            "entrypoint": entrypoint,
            "resources": {"memory": 268435456},
            "executionTimeout": "15s",
            "serviceAccountId": SA_ID,
            "content": content,
            "environment": environment,
        },
    )
    if "id" not in op and not op.get("metadata"):
        raise SystemExit(f"create version failed: {op}")
    resp = wait_op(token, op)
    vid = resp.get("id") or op.get("metadata", {}).get("versionId")
    print("version", vid)
    return vid or ""


def main() -> None:
    keydata = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    token = iam_token(keydata)
    print("IAM ok")
    fid = find_function_id(token)
    print("function", fid)
    bundle = make_zip()
    storage_env = load_storage_env()
    print("storage bucket", storage_env.get("PARTNERS_BUCKET", "(none)"))
    vid = create_version(token, fid, bundle.zip_path, storage_env, bundle.entrypoint)
    print(json.dumps({"ok": True, "functionId": fid, "versionId": vid}))


if __name__ == "__main__":
    main()
