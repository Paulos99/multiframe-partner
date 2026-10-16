#!/usr/bin/env python3
"""Deploy partner API when direct HTTPS to Yandex APIs fails (VPN TLS).

Resolves API hostnames via DNS-over-HTTPS (Cloudflare) and sends requests with
curl --resolve so the TCP/TLS path uses the resolved IP while SNI stays correct.

Usage (from repo root):
  python3 infra/mf_doh_patch_deploy.py

Expects the same credentials as infra/deploy_yc.py:
  ~/.yc/agent-project-creator-key.json
  ~/.yc/partner-storage.json (optional S3 env)
  or YC_SA_KEY_JSON / PARTNERS_BUCKET / YC_ACCESS_KEY_ID / YC_SECRET_ACCESS_KEY env vars.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOH = "https://cloudflare-dns.com/dns-query"
_a_cache: dict[str, str] = {}


def _resolve_a(hostname: str) -> str:
    if hostname in _a_cache:
        return _a_cache[hostname]
    url = f"{DOH}?name={urllib.parse.quote(hostname)}&type=A"
    req = urllib.request.Request(url, headers={"Accept": "application/dns-json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())
    for ans in data.get("Answer") or []:
        if ans.get("type") == 1:
            _a_cache[hostname] = ans["data"]
            return ans["data"]
    raise RuntimeError(f"DoH: no A record for {hostname}: {data!r}")


class _CurlHTTPResponse:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _curl_urlopen(req: urllib.request.Request, timeout=60, context=None):
    url = req.full_url
    parsed = urllib.parse.urlparse(url)
    if not parsed.hostname:
        raise urllib.error.URLError(f"no hostname in {url}")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    ip = _resolve_a(parsed.hostname)
    resolve = f"{parsed.hostname}:{port}:{ip}"
    method = req.get_method()
    cmd = [
        "curl",
        "-sS",
        "--max-time",
        str(int(timeout)),
        "--resolve",
        resolve,
        "-w",
        "\n__HTTP_CODE__:%{http_code}",
    ]
    if method != "GET":
        cmd.extend(["-X", method])
    for key, value in req.header_items():
        cmd.extend(["-H", f"{key}: {value}"])
    data = req.data
    if data is not None:
        if isinstance(data, memoryview):
            data = data.tobytes()
        cmd.extend(["--data-binary", "@-"])
    cmd.append(url)
    proc = subprocess.run(
        cmd,
        input=data if data is not None else None,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise urllib.error.URLError(
            f"curl failed ({proc.returncode}): {proc.stderr.decode(errors='replace')}"
        )
    raw = proc.stdout
    marker = b"\n__HTTP_CODE__:"
    if marker not in raw:
        raise urllib.error.URLError("curl response missing status marker")
    body, _, code_part = raw.rpartition(marker)
    try:
        status = int(code_part.decode().strip())
    except ValueError as e:
        raise urllib.error.URLError(f"bad curl status: {code_part!r}") from e
    if status >= 400:
        raise urllib.error.HTTPError(url, status, "HTTP Error", hdrs=None, fp=_CurlHTTPResponse(status, body))
    return _CurlHTTPResponse(status, body)


def _materialize_env_keys() -> None:
    yc = Path.home() / ".yc"
    yc.mkdir(parents=True, exist_ok=True)
    raw = os.environ.get("YC_SA_KEY_JSON", "").strip()
    if raw:
        (yc / "agent-project-creator-key.json").write_text(raw + "\n", encoding="utf-8")
        print("wrote", yc / "agent-project-creator-key.json", "from YC_SA_KEY_JSON")
    bucket = os.environ.get("PARTNERS_BUCKET", "").strip()
    access = os.environ.get("YC_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("YC_SECRET_ACCESS_KEY", "").strip()
    if bucket and access and secret:
        path = yc / "partner-storage.json"
        path.write_text(
            json.dumps(
                {
                    "PARTNERS_BUCKET": bucket,
                    "YC_ACCESS_KEY_ID": access,
                    "YC_SECRET_ACCESS_KEY": secret,
                    "YC_REGION": os.environ.get("YC_REGION", "ru-central1"),
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print("wrote", path, "from env")


def main() -> None:
    _materialize_env_keys()
    urllib.request.urlopen = _curl_urlopen  # type: ignore[assignment]
    sys.path.insert(0, str(ROOT / "infra"))
    os.chdir(ROOT)
    import deploy_yc

    deploy_yc.main()


if __name__ == "__main__":
    main()
