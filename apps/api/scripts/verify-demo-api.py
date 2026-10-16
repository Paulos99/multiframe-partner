#!/usr/bin/env python3
"""Verify leadership demo seed via API gateway (DoH + curl --resolve)."""
from __future__ import annotations

import json
import subprocess
import time
from urllib.parse import urlparse

BASE = "https://d5dff69141o8r1ehqm09.l5v6loqa.apigw.yandexcloud.net"
DOH = "https://cloudflare-dns.com/dns-query"
REQ = r"C:\Users\user\AppData\Local\Temp\mf_api_req.json"


def doh_a(host: str) -> str:
    out = subprocess.check_output(
        ["curl.exe", "-sS", f"{DOH}?name={host}&type=A", "-H", "accept: application/dns-json"],
        text=True,
    )
    data = json.loads(out)
    for ans in data.get("Answer") or []:
        if ans.get("type") == 1:
            return ans["data"]
    raise SystemExit(f"DoH failed: {data}")


def req(method: str, path: str, token: str | None = None, body=None, retries: int = 8):
    url = BASE + path
    host = urlparse(url).hostname or ""
    ip = doh_a(host)
    last = None
    for i in range(retries):
        cmd = [
            "curl.exe",
            "-sS",
            "--resolve",
            f"{host}:443:{ip}",
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
        if body is not None:
            open(REQ, "w", encoding="utf-8").write(json.dumps(body))
            cmd += ["-d", f"@{REQ}"]
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        out = p.stdout or ""
        if "__HTTP__" in out:
            raw, _, code = out.rpartition("\n__HTTP__")
            status = int(code.strip() or 0)
        else:
            raw, status = out, 0
        try:
            j = json.loads(raw.strip() or "{}")
        except Exception:
            j = {"raw": raw}
        if status and status < 500:
            return status, j
        last = (status, j, (p.stderr or "").strip())
        time.sleep(1 + i)
    raise SystemExit(f"fail {path}: {last}")


def main() -> None:
    st, login = req("POST", "/auth/login", body={"login": "admin", "password": "admin1234"})
    assert st == 200, login
    tok = login["token"]
    st, partners = req("GET", "/admin/partners", token=tok)
    names = [
        (p["user"]["login"], (p.get("org") or {}).get("settings", {}).get("companyName"))
        for p in partners.get("partners", [])
    ]
    print("partners", st, names)
    st, objs = req("GET", "/objects", token=tok)
    print("admin_objects", st, len(objs.get("objects") or []))
    st, dash = req("GET", "/analytics/dashboard?days=30", token=tok)
    keys = list(dash.keys())[:10] if isinstance(dash, dict) else dash
    print("admin_dash", st, keys)
    for u, pw in [
        ("partner1", "demo1234"),
        ("partner2", "demo1234"),
        ("sales1", "exec1234"),
        ("exec1", "exec1234"),
        ("crew1", "exec1234"),
        ("sales2", "exec1234"),
        ("exec2", "exec1234"),
        ("crew2", "exec1234"),
    ]:
        st, r = req("POST", "/auth/login", body={"login": u, "password": pw})
        if st != 200:
            print(u, "LOGIN_FAIL", st, r)
            continue
        t = r["token"]
        st2, o = req("GET", "/objects", token=t)
        print(
            u,
            "role=",
            r["user"]["role"],
            "org=",
            r["user"].get("orgId"),
            "name=",
            r["user"].get("displayName"),
            "objects=",
            len(o.get("objects") or []),
        )


if __name__ == "__main__":
    main()
