#!/usr/bin/env python3
"""Deploy partner API as Yandex Cloud Function + API Gateway (v2 roles/objects)."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from function_bundle import build_function_zip
from function_package import assert_function_zip_allowed, build_version_source
from verify_function_bundle import verify_function_zip

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

# All routes the API handler supports (any-method → Cloud Function).
GATEWAY_PATHS = (
    "/",
    "/health",
    "/auth/login",
    "/auth/me",
    "/auth/logout",
    "/me",
    "/me/password",
    "/me/avatar",
    "/partner/profile",
    "/org/settings",
    "/org/staff",
    "/org/staff/reset-password",
    "/org/staff/{staffId}",
    "/admin/partners",
    "/admin/partners/reset-password",
    "/admin/partners/{partnerUserId}",
    "/admin/demo/reset",
    "/objects",
    "/objects/{objectId}",
    "/objects/{objectId}/documents",
    "/objects/{objectId}/documents/{docId}",
    "/projects",
    "/projects/{projectId}",
    "/analytics/events",
    "/analytics/dashboard",
    "/materials",
    "/materials/folders",
    "/materials/files",
    "/materials/{materialId}",
    "/materials/{materialId}/content",
)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def load_key() -> dict:
    for p in KEY_PATHS:
        if p and p.is_file():
            print("using key", p)
            return json.loads(p.read_text(encoding="utf-8"))
    raise SystemExit(
        "Authorized key JSON not found. Put it in %USERPROFILE%\\.yc\\agent-project-creator-key.json"
    )


def iam_token(keydata: dict) -> str:
    pem = keydata["private_key"]
    if "BEGIN PRIVATE KEY" in pem and not pem.strip().startswith("-----"):
        pem = pem[pem.index("-----BEGIN") :]
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    last_err: Exception | None = None
    for attempt in range(1, 6):
        now = int(time.time())
        header = b64url(
            json.dumps(
                {"alg": "PS256", "typ": "JWT", "kid": keydata["id"]}, separators=(",", ":")
            ).encode()
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
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode())["iamToken"]
        except Exception as e:
            last_err = e
            print(f"IAM attempt {attempt}/5 failed: {e}")
            time.sleep(2 * attempt)
    raise SystemExit(f"IAM token failed after retries: {last_err}")


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


def api_soft(method: str, url: str, token: str, body: dict | None = None):
    """Like api(), but returns (status, body_dict_or_text) without exiting."""
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
        try:
            return e.code, json.loads(err)
        except Exception:
            return e.code, {"raw": err}


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
            "description": "MultiFrame partner platform API v2",
        },
    )
    resp = wait_op(token, op)
    fid = resp.get("id") or resp.get("metadata", {}).get("functionId")
    if not fid:
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


def make_zip():
    zip_path = API_DIR / "function.zip"
    bundle = build_function_zip(zip_path, include_node_modules=True)
    print(
        "zip",
        zip_path,
        "bytes",
        zip_path.stat().st_size,
        "entrypoint",
        bundle.entrypoint,
    )
    print("bundle:", ", ".join(bundle.api_files))
    if bundle.outside_api:
        print("outside apps/api:", ", ".join(bundle.outside_api))
    return bundle


def load_storage_env() -> dict[str, str]:
    """Optional persistent storage from env or local secrets file."""
    secrets_path = Path.home() / ".yc" / "partner-storage.json"
    data: dict = {}
    if secrets_path.is_file():
        try:
            data = json.loads(secrets_path.read_text(encoding="utf-8"))
        except Exception as e:
            print("WARN read partner-storage.json:", e)
    bucket = (os.environ.get("PARTNERS_BUCKET") or data.get("PARTNERS_BUCKET") or "").strip()
    materials = (os.environ.get("MATERIALS_BUCKET") or data.get("MATERIALS_BUCKET") or "").strip()
    access = os.environ.get("YC_ACCESS_KEY_ID") or data.get("YC_ACCESS_KEY_ID") or ""
    secret = os.environ.get("YC_SECRET_ACCESS_KEY") or data.get("YC_SECRET_ACCESS_KEY") or ""
    out: dict[str, str] = {}
    if bucket and access and secret:
        if materials and materials == bucket:
            raise SystemExit(
                "MATERIALS_BUCKET совпадает с PARTNERS_BUCKET. "
                "Материалы нельзя писать в бакет кабинета."
            )
        out = {
            "PARTNERS_BUCKET": bucket,
            "YC_ACCESS_KEY_ID": access,
            "YC_SECRET_ACCESS_KEY": secret,
            "YC_REGION": data.get("YC_REGION") or os.environ.get("YC_REGION") or "ru-central1",
            "PLATFORM_KEY": "platform-v2.json",
        }
        if materials:
            out["MATERIALS_BUCKET"] = materials
            print("storage env: bucket", bucket, "materials", materials)
        else:
            print(
                "storage env: bucket",
                bucket,
                "(MATERIALS_BUCKET не задан — загрузка материалов ответит 503)",
            )
    else:
        print("storage env: none (in-memory seed; set ~/.yc/partner-storage.json for Object Storage)")
    return out


def try_ensure_bucket_and_keys(token: str) -> dict[str, str]:
    """Best-effort: create bucket + static access key for SA. Returns storage env or {}."""
    existing = load_storage_env()
    if existing:
        return existing

    bucket_name = (os.environ.get("PARTNERS_BUCKET") or "").strip()
    if not bucket_name:
        print(
            "PARTNERS_BUCKET не задан — бакет кабинета не создаётся, "
            "имя multiframe-partner-data не подставляется. Деплой продолжится с in-memory seed."
        )
        return {}

    # Create bucket via Object Storage API (S3-compatible needs keys; use Resource Manager / storage API)
    print("trying to create Object Storage bucket", bucket_name)
    status, body = api_soft(
        "POST",
        "https://storage.api.cloud.yandex.net/storage/v1/buckets",
        token,
        {
            "name": bucket_name,
            "folderId": FOLDER_ID,
            "defaultStorageClass": "STANDARD",
            "maxSize": "1073741824",
            "anonymousAccessFlags": {
                "read": False,
                "list": False,
                "configRead": False,
            },
        },
    )
    if status in (200, 201):
        print("bucket created", bucket_name)
    elif status == 409 or (isinstance(body, dict) and "already" in json.dumps(body).lower()):
        print("bucket already exists or conflict", status, body)
    else:
        print("WARN bucket create", status, body)

    # Create static access key for SA
    print("trying to create static access key for SA", SA_ID)
    status, body = api_soft(
        "POST",
        "https://iam.api.cloud.yandex.net/iam/v1/awsKeyPairs",
        token,
        {"serviceAccountId": SA_ID, "description": "multiframe-partner-api storage"},
    )
    # Older/alternate endpoint
    if status >= 400:
        status, body = api_soft(
            "POST",
            "https://iam.api.cloud.yandex.net/iam/aws-compatibility/v1/accessKeys",
            token,
            {"serviceAccountId": SA_ID, "description": "multiframe-partner-api storage"},
        )

    access_key = ""
    secret_key = ""
    if isinstance(body, dict):
        access_key = (
            body.get("accessKey", {}).get("keyId")
            or body.get("accessKey", {}).get("id")
            or body.get("keyId")
            or ""
        )
        secret_key = body.get("secret") or body.get("accessKey", {}).get("secret") or ""
        # Yandex returns: { accessKey: { keyId, serviceAccountId, ... }, secret: "..." }
        if not access_key and body.get("accessKey"):
            access_key = body["accessKey"].get("keyId") or body["accessKey"].get("id") or ""

    if access_key and secret_key:
        secrets = {
            "PARTNERS_BUCKET": bucket_name,
            "YC_ACCESS_KEY_ID": access_key,
            "YC_SECRET_ACCESS_KEY": secret_key,
            "YC_REGION": "ru-central1",
        }
        secrets_path = Path.home() / ".yc" / "partner-storage.json"
        secrets_path.parent.mkdir(parents=True, exist_ok=True)
        secrets_path.write_text(json.dumps(secrets, indent=2), encoding="utf-8")
        print("wrote", secrets_path)
        # Grant storage.editor on folder to SA (best effort)
        api_soft(
            "POST",
            f"https://resource-manager.api.cloud.yandex.net/resource-manager/v1/folders/{FOLDER_ID}:updateAccessBindings",
            token,
            {
                "accessBindingDeltas": [
                    {
                        "action": "ADD",
                        "accessBinding": {
                            "roleId": "storage.editor",
                            "subject": {"id": SA_ID, "type": "serviceAccount"},
                        },
                    }
                ]
            },
        )
        return {
            **secrets,
            "PLATFORM_KEY": "platform-v2.json",
        }

    print("WARN could not create static access key", status, body)
    print("Deploy continues with in-memory seed. Add keys to ~/.yc/partner-storage.json later.")
    return {}


def create_version(
    token: str,
    function_id: str,
    zip_path: Path,
    storage_env: dict[str, str],
    entrypoint: str,
    source: dict,
) -> str:
    jwt_secret = hashlib.sha256(f"mf-partner-{FOLDER_ID}-{SA_ID}".encode()).hexdigest()
    environment = {
        "JWT_SECRET": jwt_secret,
        "CORS_ORIGIN": "*",
        "ANALYTICS_KEY": "analytics-events.json",
        "ANALYTICS_ADMIN_KEY": "admin1234",
        "PLATFORM_KEY": "platform-v2.json",
        **storage_env,
    }
    # AWS SDK is optional — only needed with PARTNERS_BUCKET. Bundle already has jose/bcryptjs.
    print("creating version… env keys:", sorted(environment.keys()))
    _, op = api(
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
            "environment": environment,
            **source,
        },
    )
    resp = wait_op(token, op, timeout=420)
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
    for p in GATEWAY_PATHS:
        paths[p] = {
            "x-yc-apigateway-any-method": {
                **cf_integration(),
                "responses": {"200": {"description": "ok"}},
            }
        }
    openapi = {
        "openapi": "3.0.0",
        "info": {"title": "MF Partner API", "version": "2.0.0"},
        "paths": paths,
    }

    _, listing = api(
        "GET",
        f"https://serverless-apigateway.api.cloud.yandex.net/apigateways/v1/apigateways?folderId={FOLDER_ID}",
        token,
    )
    for g in listing.get("apiGateways", []):
        if g.get("name") == GW_NAME:
            print("updating API gateway openapi…", g["id"], "paths", len(paths))
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
            "description": "Partner portal API v2",
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


def smoke(domain: str) -> None:
    base = f"https://{domain}"
    print("\n=== smoke tests ===", base)

    def http(method: str, path: str, body: dict | None = None, headers: dict | None = None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw)
            except Exception:
                return e.code, {"raw": raw}

    st, health = http("GET", "/health")
    print("GET /health", st, health)
    if st != 200 or health.get("version") != 2:
        print("WARN: expected version 2 — function may still be old or path wrong")

    st, login = http("POST", "/auth/login", {"login": "partner1", "password": "demo1234"})
    print("POST /auth/login partner1", st, {k: login.get(k) for k in ("token", "user", "message") if k in login or k == "message"})
    token = login.get("token")
    if not token:
        print("FAIL login")
        return
    role = (login.get("user") or {}).get("role")
    print("role", role)

    st, me = http("GET", "/auth/me", headers={"Authorization": f"Bearer {token}"})
    print("GET /auth/me", st, (me.get("user") or {}).get("role"), (me.get("user") or {}).get("org", {}).get("companyName"))

    st, objs = http("GET", "/objects", headers={"Authorization": f"Bearer {token}"})
    print("GET /objects", st, "count", len(objs.get("objects") or []), objs.get("message"))

    st, crew = http("POST", "/auth/login", {"login": "crew1", "password": "exec1234"})
    crew_user = crew.get("user") or {}
    org = crew_user.get("org") or {}
    print(
        "POST /auth/login crew1",
        st,
        "role",
        crew_user.get("role"),
        "panelPriceRub",
        org.get("panelPriceRub"),
        "pricePerM2",
        org.get("pricePerM2"),
    )


def main():
    bundle = make_zip()
    # Размер и playwright проверяются до сети. IMPORT_OK — по тому же файлу,
    # который уйдёт в облако. Ошибка завершает процесс до IAM и загрузки.
    mode = assert_function_zip_allowed(bundle.zip_path)
    verify_function_zip(bundle.zip_path, entry_file=bundle.entry_file)
    key = load_key()
    token = iam_token(key)
    print("IAM ok")
    fid = ensure_function(token)
    storage_env = try_ensure_bucket_and_keys(token)
    source = build_version_source(bundle.zip_path, storage_env, mode)
    create_version(token, fid, bundle.zip_path, storage_env, bundle.entrypoint, source)
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
        # Give gateway a moment to pick up new function version
        time.sleep(3)
        smoke(domain)


if __name__ == "__main__":
    main()
