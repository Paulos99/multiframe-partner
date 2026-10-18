"""Preserve deployed configuration; never derive credentials from public IDs."""
import os
from urllib.parse import urlencode


def version_environment(token, function_id, request, storage_env):
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
    for name in ("JWT_SECRET", "JWT_SECRET_PREVIOUS", "ANALYTICS_ADMIN_KEY"):
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
    return environment
