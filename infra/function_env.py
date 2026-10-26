"""Preserve deployed configuration; never derive credentials from public IDs."""
import hashlib
import os
from urllib.parse import urlencode

SECRET_NAMES = ("JWT_SECRET", "JWT_SECRET_PREVIOUS", "ANALYTICS_ADMIN_KEY")
MIN_SECRET_LENGTH = 32


def legacy_derived_key(folder_id, sa_id):
    """The old JWT key was computable from public IDs; it must never be deployed again."""
    return hashlib.sha256(f"mf-partner-{folder_id}-{sa_id}".encode()).hexdigest()


def version_environment(token, function_id, request, storage_env, compromised=()):
    query = urlencode({"functionId": function_id, "tag": "$latest"})
    status, version = request(
        "GET",
        f"https://serverless-functions.api.cloud.yandex.net/functions/v1/versions:byTag?{query}",
        token,
    )
    if status not in (200, 404):
        raise SystemExit(f"Cannot read latest function environment (HTTP {status}); deploy stopped")
    environment = dict(version.get("environment", {})) if status == 200 else {}
    environment.setdefault("ANALYTICS_KEY", "analytics-events.json")
    environment.setdefault("PLATFORM_KEY", "platform-v2.json")
    environment.update(storage_env)
    environment["CORS_ORIGIN"] = os.environ.get("CORS_ORIGIN") or "https://paulos99.github.io"
    # Адрес YDB не секрет: берём из GitHub vars, пустое значение сохраняет текущее.
    for name in ("YDB_ENDPOINT", "YDB_DATABASE"):
        if os.environ.get(name):
            environment[name] = os.environ[name].strip()
    for name in SECRET_NAMES:
        value = os.environ.get(name)
        if value:
            environment[name] = value
        if name != "JWT_SECRET_PREVIOUS" and not environment.get(name):
            raise SystemExit(f"Missing {name}: set deployment environment/GitHub Secret or configure the function")
    # Empty GitHub Secrets mean "preserve", so removal needs an explicit switch.
    if os.environ.get("JWT_SECRET_PREVIOUS_CLEAR") == "true":
        if os.environ.get("JWT_SECRET_PREVIOUS"):
            raise SystemExit("Remove JWT_SECRET_PREVIOUS before setting JWT_SECRET_PREVIOUS_CLEAR=true")
        environment.pop("JWT_SECRET_PREVIOUS", None)
    # Preserved function env may still hold the old public values: refuse to redeploy them.
    for name in SECRET_NAMES:
        value = environment.get(name)
        if value and (len(value) < MIN_SECRET_LENGTH or value in compromised):
            raise SystemExit(f"{name} is too short or a known compromised value; set a new random GitHub Secret")
    return environment
