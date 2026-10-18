#!/usr/bin/env python3
"""Собрать архив функции во временную папку и импортировать точку входа.

Облачные ключи не читаются. Импорт идёт с пустым окружением хранилища и с
заблокированными сетевыми вызовами: модуль должен загрузиться без
ERR_MODULE_NOT_FOUND и без обращения к сети.

Зависимости берутся из apps/api/node_modules, если каталог уже есть
(так делает CI после npm ci). Иначе npm ci ставит их по lock из архива.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from function_bundle import ROOT, build_function_zip

NODE_CHECK = r"""
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';

function blocked(name) {
  return () => {
    const error = new Error(`network blocked during function import (${name})`);
    error.code = 'NETWORK_BLOCKED';
    throw error;
  };
}
http.request = blocked('http.request');
http.get = blocked('http.get');
https.request = blocked('https.request');
https.get = blocked('https.get');
net.connect = blocked('net.connect');
net.createConnection = blocked('net.createConnection');
dns.lookup = blocked('dns.lookup');
dns.resolve = blocked('dns.resolve');
if (dns.promises) {
  dns.promises.lookup = blocked('dns.promises.lookup');
  dns.promises.resolve = blocked('dns.promises.resolve');
}
globalThis.fetch = blocked('fetch');

const entry = process.env.MF_ENTRY;
if (!entry) {
  console.error('MF_ENTRY is empty');
  process.exit(1);
}
let mod;
try {
  mod = await import(entry);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
if (typeof mod.handler !== 'function') {
  console.error('export handler is not a function');
  process.exit(1);
}
console.log('IMPORT_OK');
console.log('exports:', Object.keys(mod).sort().join(','));
"""

REQUIRED_ANY = (("package-lock.json", "npm-shrinkwrap.json"),)


def main() -> None:
    repo = ROOT.resolve()
    with tempfile.TemporaryDirectory(prefix="mf-function-bundle-") as tmp_name:
        tmp = Path(tmp_name)
        bundle = build_function_zip(tmp / "function.zip", include_node_modules=False, root=repo)
        _check_members(bundle.api_files)
        extract = tmp / "extract"
        _safe_extract(bundle.zip_path, extract)
        package_dir = extract / bundle.package_dir
        deps = _stage_dependencies(package_dir, repo)
        import_result = _import_entry(package_dir, bundle.entry_file)

    print("function bundle ok")
    print(f"repo: {repo}")
    print(f"entrypoint: {bundle.entrypoint}")
    print(f"entry file: {bundle.entry_file}")
    print(f"dependencies: {deps}")
    print(f"api files ({len(bundle.api_files)}):")
    for name in bundle.api_files:
        print(f"  {name}")
    if bundle.outside_api:
        print("local imports outside apps/api:")
        for name in bundle.outside_api:
            print(f"  {name}")
    else:
        print("local imports outside apps/api: (none)")
    print(import_result)


def _check_members(api_files: tuple[str, ...]) -> None:
    present = set(api_files)
    for name in api_files:
        path = Path(name)
        if ".test." in path.name:
            raise SystemExit(f"в архив попал тест: {name}")
        if "scripts" in path.parts:
            raise SystemExit(f"в архив попал scripts/: {name}")
    if "package.json" not in present:
        raise SystemExit("в архиве нет package.json")
    if "index.js" not in present and "index.mjs" not in present:
        raise SystemExit("в архиве нет index.js")
    for options in REQUIRED_ANY:
        if not any(name in present for name in options):
            raise SystemExit(f"в архиве нет lock-файла: {' или '.join(options)}")


def _safe_extract(zip_path: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = info.filename
            parts = Path(name).parts
            if name.startswith("/") or ".." in parts or name.startswith("\\"):
                raise SystemExit(f"небезопасное имя в архиве: {name}")
            target = (dest / name).resolve()
            if dest_resolved not in target.parents and target != dest_resolved:
                raise SystemExit(f"небезопасное имя в архиве: {name}")
        zf.extractall(dest)


def _stage_dependencies(package_dir: Path, repo: Path) -> str:
    existing = (repo / "apps" / "api" / "node_modules").resolve()
    dest = package_dir / "node_modules"
    if existing.is_dir():
        dest.symlink_to(existing, target_is_directory=True)
        return f"symlink {existing}"
    if shutil.which("npm") is None:
        raise SystemExit("нет apps/api/node_modules и нет npm, чтобы выполнить npm ci")
    print("npm ci в распакованном архиве…", flush=True)
    proc = subprocess.run(
        ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
        cwd=package_dir,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"npm ci в архиве завершился с кодом {proc.returncode}")
    return "npm ci --ignore-scripts"


def _import_entry(package_dir: Path, entry_file: str) -> str:
    entry = package_dir / entry_file if Path(entry_file).is_absolute() else _entry_path(package_dir, entry_file)
    if not entry.is_file():
        raise SystemExit(f"после распаковки нет {entry}")
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        "TMPDIR": os.environ.get("TMPDIR", "/tmp"),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "NODE_NO_WARNINGS": "1",
        "MF_ENTRY": entry.resolve().as_uri(),
    }
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_CHECK],
        cwd=package_dir,
        env=env,
        text=True,
        capture_output=True,
        timeout=60,
    )
    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    if proc.returncode != 0 or "IMPORT_OK" not in proc.stdout:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise SystemExit(f"импорт точки входа не удался (код {proc.returncode})\n{detail}")
    if "ERR_MODULE_NOT_FOUND" in proc.stderr or "ERR_MODULE_NOT_FOUND" in proc.stdout:
        raise SystemExit("импорт завершился с ERR_MODULE_NOT_FOUND")
    return "import: ok (handler exported, network blocked, storage env absent)"


def _entry_path(package_dir: Path, entry_file: str) -> Path:
    """entry_file задан от корня архива; package_dir — каталог с package.json внутри распаковки."""
    if entry_file.startswith("apps/api/"):
        return package_dir / entry_file.removeprefix("apps/api/")
    return package_dir / entry_file


if __name__ == "__main__":
    try:
        main()
    except subprocess.TimeoutExpired:
        raise SystemExit("импорт точки входа не завершился за 60с") from None
