#!/usr/bin/env python3
"""Проверить уже собранный архив Cloud Function до загрузки.

verify_function_zip читает переданный zip (тот, который скрипт деплоя
отправит в Yandex Cloud), распаковывает его во временную папку, ставит
зависимости командой npm ci --omit=dev по lock из этого архива и импортирует точку
входа. Облачные ключи не читаются. Сетевые вызовы на время импорта
заблокированы.

node_modules внутри архива не используются: иначе проверка смотрела бы
не на lock, а на уже установленное дерево. Исходники и lock берутся
только из переданного zip, второй архив не собирается.
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

LOCK_NAMES = ("package-lock.json", "npm-shrinkwrap.json")


def verify_function_zip(zip_path: Path, *, entry_file: str) -> str:
    """Проверить конкретный архив. SystemExit, если сервер из него не импортируется."""
    zip_path = Path(zip_path)
    if not zip_path.is_file():
        raise SystemExit(f"нет архива функции: {zip_path}")
    with tempfile.TemporaryDirectory(prefix="mf-function-bundle-") as tmp_name:
        extract = Path(tmp_name) / "extract"
        names = _safe_extract(zip_path, extract)
        _check_members(names)
        if entry_file not in names:
            raise SystemExit(f"в архиве нет точки входа {entry_file}")
        package_dir = _package_dir(extract, entry_file)
        _npm_ci(package_dir)
        import_result = _import_entry(extract / entry_file)
    print("function bundle ok")
    print(f"zip: {zip_path.resolve()}")
    print(f"entry file: {entry_file}")
    print("dependencies: npm ci --omit=dev --ignore-scripts (lock from this zip)")
    print(import_result)
    return import_result


def main() -> None:
    """Локальный прогон: собрать архив и сразу проверить этот же файл. В облако не отправляет."""
    repo = ROOT.resolve()
    with tempfile.TemporaryDirectory(prefix="mf-function-preview-") as tmp_name:
        bundle = build_function_zip(
            Path(tmp_name) / "function.zip",
            include_node_modules=False,
            root=repo,
        )
        print(f"api files ({len(bundle.api_files)}):")
        for name in bundle.api_files:
            print(f"  {name}")
        if bundle.outside_api:
            print("local imports outside apps/api:")
            for name in bundle.outside_api:
                print(f"  {name}")
        else:
            print("local imports outside apps/api: (none)")
        verify_function_zip(bundle.zip_path, entry_file=bundle.entry_file)


def _check_members(names: list[str]) -> None:
    files = [name for name in names if "node_modules" not in Path(name).parts]
    for name in files:
        path = Path(name)
        if ".test." in path.name:
            raise SystemExit(f"в архив попал тест: {name}")
        if "scripts" in path.parts:
            raise SystemExit(f"в архив попал scripts/: {name}")
    if not any(Path(name).name == "package.json" for name in files):
        raise SystemExit("в архиве нет package.json")
    if not any(Path(name).name in ("index.js", "index.mjs") for name in files):
        raise SystemExit("в архиве нет index.js")
    if not any(Path(name).name in LOCK_NAMES for name in files):
        raise SystemExit("в архиве нет lock-файла")


def _safe_extract(zip_path: Path, dest: Path) -> list[str]:
    """Распаковать архив без node_modules: зависимости поставит npm ci по lock из него."""
    dest.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest.resolve()
    names: list[str] = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = info.filename
            if not name or name.endswith("/"):
                continue
            parts = Path(name).parts
            if name.startswith("/") or name.startswith("\\") or ".." in parts:
                raise SystemExit(f"небезопасное имя в архиве: {name}")
            target = (dest / name).resolve()
            if dest_resolved not in target.parents and target != dest_resolved:
                raise SystemExit(f"небезопасное имя в архиве: {name}")
            if "node_modules" in parts:
                continue
            zf.extract(info, dest)
            names.append(name)
    return names


def _package_dir(extract: Path, entry_file: str) -> Path:
    entry = extract / entry_file
    if not entry.is_file():
        raise SystemExit(f"после распаковки нет {entry_file}")
    current = entry.parent
    while True:
        if (current / "package.json").is_file():
            lock = next((current / name for name in LOCK_NAMES if (current / name).is_file()), None)
            if lock is None:
                raise SystemExit(f"рядом с {entry_file} нет lock-файла")
            return current
        if current == extract:
            break
        current = current.parent
    raise SystemExit("в архиве нет package.json рядом с точкой входа")


def _npm_ci(package_dir: Path) -> None:
    if shutil.which("npm") is None:
        raise SystemExit("нет npm, чтобы выполнить npm ci по lock из архива")
    node_modules = package_dir / "node_modules"
    if node_modules.exists():
        shutil.rmtree(node_modules)
    print(f"npm ci по lock из архива в {package_dir}…", flush=True)
    proc = subprocess.run(
        ["npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
        cwd=package_dir,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"npm ci в архиве завершился с кодом {proc.returncode}")


def _import_entry(entry: Path) -> str:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        "TMPDIR": os.environ.get("TMPDIR", "/tmp"),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "NODE_NO_WARNINGS": "1",
        "MF_ENTRY": entry.resolve().as_uri(),
    }
    try:
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", NODE_CHECK],
            cwd=entry.parent,
            env=env,
            text=True,
            capture_output=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        raise SystemExit("импорт точки входа не завершился за 60с") from None
    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    combined = f"{proc.stdout}\n{proc.stderr}"
    if "ERR_MODULE_NOT_FOUND" in combined:
        raise SystemExit(f"импорт точки входа не удался: ERR_MODULE_NOT_FOUND\n{combined.strip()}")
    if proc.returncode != 0 or "IMPORT_OK" not in proc.stdout:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise SystemExit(f"импорт точки входа не удался (код {proc.returncode})\n{detail}")
    return "import: ok (handler exported, network blocked, storage env absent)"


if __name__ == "__main__":
    main()
