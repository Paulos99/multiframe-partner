#!/usr/bin/env python3
"""Deploy partner API as Yandex Cloud Function + API Gateway."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

FOLDER_ID = "b1gibd821or94p6f9v1q"
SA_ID = "aje4r8khao2t9nl9dp8e"
FUNC_NAME = "multiframe-partner-api"
GW_NAME = "multiframe-partner-gw"
ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
KEY_PATHS = [
    Path(os.environ.get("YC_SA_KEY_FILE", "")),
    Path.home() / ".yc" / "agent-project-creator-key.json",
    Path(r"C:\Users\user\Desktop\agent-project-creator-key.json"),
]


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def load_key() -> dict:
    for p in KEY_PATHS:
        if p and p.is_file():
            return json.loads(p.read_text(encoding="utf-8"))
    raise SystemExit("Authorized key JSON not found. Put it in %USERPROFILE%\\.yc\\agent-project-creator-key.json")


def iam_token(keydata: dict) -> str:
    pem = keydata["private_key"]
    # Strip Yandex banner line if present
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
    req = urllib.request.Request(
        "https://iam.api.cloud.yandex.net/iam/v1/tokens",
        data=json.dumps({"jwt": jwt}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())["iamToken"]


def api(method: str, url: str, token: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise SystemExit(f"HTTP {e.code} {url}\n{err}") from e


def wait_op(token: str, op: dict, timeout=300):
    op_id = op.get("id")
    if not op_id:
        return op
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, st = api("GET", f"https://operation.api.cloud.yandex.net/operations/{op_id}", token)
        if st.get("done"):
            if "error" in st:
                raise SystemExit(f"Operation failed: {st['error']}")
            return st.get("response", st)
        time.sleep(2)
    raise SystemExit("Operation timeout")


def ensure_function(token: str) -> str:
    _, listing = api(
        "GET",
        f"https://serverless-functions.api.cloud.yandex.net/functions/v1/functions?folderId={FOLDER_ID}",
        token,
    )
    for f in listing.get("functions", []):
        if f.get("name") == FUNC_NAME:
            print("function exists", f["id"])
            return f["id"]
    print("creating function…")
    _, op = api(
        "POST",
        "https://serverless-functions.api.cloud.yandex.net/functions/v1/functions",
        token,
        {
            "folderId": FOLDER_ID,
            "name": FUNC_NAME,
            "description": "MultiFrame partner auth API",
        },
    )
    resp = wait_op(token, op)
    fid = resp.get("id") or resp.get("metadata", {}).get("functionId")
    if not fid:
        # list again
        _, listing = api(
            "GET",
            f"https://serverless-functions.api.cloud.yandex.net/functions/v1/functions?folderId={FOLDER_ID}",
            token,
        )
        for f in listing.get("functions", []):
            if f.get("name") == FUNC_NAME:
                return f["id"]
        raise SystemExit(f"No function id in response: {resp}")
    return fid


def make_zip() -> Path:
    zip_path = API_DIR / "function.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(API_DIR / "index.js", "index.js")
        zf.write(API_DIR / "package.json", "package.json")
        nm = API_DIR / "node_modules"
        if not nm.is_dir():
            raise SystemExit("Run npm install in apps/api first")
        for path in nm.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(API_DIR).as_posix())
    print("zip", zip_path, "bytes", zip_path.stat().st_size)
    return zip_path


def create_version(token: str, function_id: str, zip_path: Path) -> str:
    content = base64.b64encode(zip_path.read_bytes()).decode()
    jwt_secret = hashlib.sha256(f"mf-partner-{FOLDER_ID}-{SA_ID}".encode()).hexdigest()
    print("creating version…")
    _, op = api(
        "POST",
        "https://serverless-functions.api.cloud.yandex.net/functions/v1/versions",
        token,
        {
            "functionId": function_id,
            "runtime": "nodejs22",
            "entrypoint": "index.handler",
            "resources": {"memory": 134217728},
            "executionTimeout": "10s",
            "serviceAccountId": SA_ID,
            "content": content,
            "environment": {
                "JWT_SECRET": jwt_secret,
                "CORS_ORIGIN": "*",
                "ANALYTICS_KEY": "analytics-events.json",
                "ANALYTICS_ADMIN_KEY": "admin1234",
            },
        },
    )
    resp = wait_op(token, op)
    vid = resp.get("id")
    print("version", vid)
    return vid or ""


def ensure_gateway(token: str, function_id: str) -> str:
    def cf_integration():
        return {
            "x-yc-apigateway-integration": {
                "type": "cloud_functions",
                "function_id": function_id,
                "service_account_id": SA_ID,
                "payload_format_version": "1.0",
            }
        }

    paths = {}
    for p in (
        "/",
        "/health",
        "/auth/login",
        "/auth/me",
        "/auth/logout",
        "/partner/profile",
        "/analytics/events",
        "/analytics/dashboard",
    ):
        paths[p] = {
            "x-yc-apigateway-any-method": {
                **cf_integration(),
                "responses": {"200": {"description": "ok"}},
            }
        }
    openapi = {
        "openapi": "3.0.0",
        "info": {"title": "MF Partner API", "version": "1.1.0"},
        "paths": paths,
    }

    _, listing = api(
        "GET",
        f"https://serverless-apigateway.api.cloud.yandex.net/apigateways/v1/apigateways?folderId={FOLDER_ID}",
        token,
    )
    for g in listing.get("apiGateways", []):
        if g.get("name") == GW_NAME:
            print("updating API gateway openapi…", g["id"])
            _, op_upd = api(
                "PATCH",
                f"https://serverless-apigateway.api.cloud.yandex.net/apigateways/v1/apigateways/{g['id']}",
                token,
                {"openapiSpec": json.dumps(openapi)},
            )
            wait_op(token, op_upd, timeout=420)
            print("gateway updated", g.get("domain"))
            return g.get("domain") or g["id"]

    print("creating API gateway…")
    _, op = api(
        "POST",
        "https://serverless-apigateway.api.cloud.yandex.net/apigateways/v1/apigateways",
        token,
        {
            "folderId": FOLDER_ID,
            "name": GW_NAME,
            "description": "Partner portal API",
            "openapiSpec": json.dumps(openapi),
        },
    )
    resp = wait_op(token, op, timeout=420)
    domain = resp.get("domain")
    if not domain:
        _, listing = api(
            "GET",
            f"https://serverless-apigateway.api.cloud.yandex.net/apigateways/v1/apigateways?folderId={FOLDER_ID}",
            token,
        )
        for g in listing.get("apiGateways", []):
            if g.get("name") == GW_NAME:
                domain = g.get("domain")
    print("gateway domain", domain)
    return domain or ""


def main():
    key = load_key()
    token = iam_token(key)
    print("IAM ok")
    fid = ensure_function(token)
    zip_path = make_zip()
    create_version(token, fid, zip_path)
    # Prefer SA invoke via API Gateway; allUsers binding may require admin.
    try:
        api(
            "POST",
            f"https://serverless-functions.api.cloud.yandex.net/functions/v1/functions/{fid}:setAccessBindings",
            token,
            {
                "accessBindings": [
                    {
                        "roleId": "serverless.functions.invoker",
                        "subject": {"id": SA_ID, "type": "serviceAccount"},
                    }
                ]
            },
        )
        print("invoker binding for SA ok")
    except SystemExit as e:
        print("WARN setAccessBindings:", e)
    domain = ensure_gateway(token, fid)
    if domain:
        print("\nVITE_API_URL=https://" + domain)
        (ROOT / "apps" / "web" / ".env").write_text(
            f"VITE_API_URL=https://{domain}\n", encoding="utf-8"
        )
        print("wrote apps/web/.env")


if __name__ == "__main__":
    main()
