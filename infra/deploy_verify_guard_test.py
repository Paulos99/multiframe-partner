#!/usr/bin/env python3
"""Оба скрипта деплоя проверяют переданный архив до загрузки в Yandex Cloud.

Сломанный zip: импорт падает, заглушка загрузки не вызывается.
Целый zip: проверка проходит, заглушка загрузки получает тот же путь.
Сеть и облачные ключи не используются.
"""
from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import deploy_yc
import mf_doh_patch_deploy
from function_bundle import FunctionBundle

PACKAGE_JSON = json.dumps(
    {"name": "mf-bundle-guard", "version": "1.0.0", "private": True, "type": "module"},
    indent=2,
)
PACKAGE_LOCK = json.dumps(
    {
        "name": "mf-bundle-guard",
        "version": "1.0.0",
        "lockfileVersion": 3,
        "requires": True,
        "packages": {"": {"name": "mf-bundle-guard", "version": "1.0.0"}},
    },
    indent=2,
)
GOOD_INDEX = "export async function handler() {\n  return { ok: true };\n}\n"
BROKEN_INDEX = "import './missing-module.js';\nexport async function handler() {}\n"


def write_zip(path: Path, index_source: str) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("index.js", index_source)
        zf.writestr("package.json", PACKAGE_JSON + "\n")
        zf.writestr("package-lock.json", PACKAGE_LOCK + "\n")


def bundle_for(path: Path) -> FunctionBundle:
    return FunctionBundle(
        zip_path=path,
        entrypoint="index.handler",
        entry_file="index.js",
        package_dir=".",
        api_files=("index.js", "package-lock.json", "package.json"),
        outside_api=(),
    )


class DeployVerifyGuardTest(unittest.TestCase):
    def test_deploy_yc_broken_zip_stops_before_upload(self) -> None:
        self._assert_broken(deploy_yc)

    def test_mf_doh_broken_zip_stops_before_upload(self) -> None:
        self._assert_broken(mf_doh_patch_deploy)

    def test_deploy_yc_good_zip_uploads_the_verified_file(self) -> None:
        self._assert_good(deploy_yc)

    def test_mf_doh_good_zip_uploads_the_verified_file(self) -> None:
        self._assert_good(mf_doh_patch_deploy)

    def _assert_broken(self, module) -> None:
        with tempfile.TemporaryDirectory() as tmp_name:
            zip_path = Path(tmp_name) / "function.zip"
            write_zip(zip_path, BROKEN_INDEX)
            calls: list[tuple] = []
            with self._cloud_stubs(module, bundle_for(zip_path), calls):
                with self.assertRaises(SystemExit) as caught:
                    module.main()
            self.assertIn("ERR_MODULE_NOT_FOUND", str(caught.exception))
            self.assertEqual(calls, [("verify", zip_path.resolve(), "index.js")])

    def _assert_good(self, module) -> None:
        with tempfile.TemporaryDirectory() as tmp_name:
            zip_path = Path(tmp_name) / "function.zip"
            write_zip(zip_path, GOOD_INDEX)
            calls: list[tuple] = []
            with self._cloud_stubs(module, bundle_for(zip_path), calls):
                module.main()
            verify_calls = [item for item in calls if item[0] == "verify"]
            upload_calls = [item for item in calls if item[0] == "create_version"]
            self.assertEqual(verify_calls, [("verify", zip_path.resolve(), "index.js")])
            self.assertEqual(len(upload_calls), 1)
            self.assertEqual(upload_calls[0][1], zip_path.resolve())
            self.assertLess(calls.index(verify_calls[0]), calls.index(upload_calls[0]))

    def _cloud_stubs(self, module, bundle: FunctionBundle, calls: list[tuple]):
        originals = {name: getattr(module, name) for name in self._stub_names(module)}
        originals["verify_function_zip"] = module.verify_function_zip
        originals["make_zip"] = module.make_zip

        def verify(zip_path, *, entry_file):
            calls.append(("verify", Path(zip_path).resolve(), entry_file))
            return originals["verify_function_zip"](zip_path, entry_file=entry_file)

        def create_version(token, function_id, zip_path, storage_env, entrypoint):
            calls.append(("create_version", Path(zip_path).resolve(), entrypoint))
            return "version-stub"

        def record(name, result):
            def fn(*_args, **_kwargs):
                calls.append((name,))
                return result
            return fn

        replacements = {
            "make_zip": lambda: bundle,
            "verify_function_zip": verify,
            "create_version": create_version,
            "iam_token": record("iam_token", "token"),
            "load_key": record("load_key", {"id": "k", "service_account_id": "sa", "private_key": "x"}),
            "ensure_function": record("ensure_function", "function-stub"),
            "try_ensure_bucket_and_keys": record("try_ensure_bucket_and_keys", {}),
            "find_function_id": record("find_function_id", "function-stub"),
            "load_storage_env": record("load_storage_env", {}),
            "api": record("api", (200, {})),
            "ensure_gateway": record("ensure_gateway", ""),
            "smoke": record("smoke", None),
        }
        for name, fn in replacements.items():
            if hasattr(module, name):
                setattr(module, name, fn)
        key_path = getattr(module, "KEY_PATH", None)
        if key_path is not None:
            dummy = bundle.zip_path.parent / "sa-key.json"
            dummy.write_text(
                json.dumps({"id": "k", "service_account_id": "sa", "private_key": "not-used"}),
                encoding="utf-8",
            )
            module.KEY_PATH = dummy
        return _Restore(module, originals, key_path)


    def _stub_names(self, module) -> tuple[str, ...]:
        return tuple(
            name
            for name in (
                "make_zip",
                "verify_function_zip",
                "create_version",
                "iam_token",
                "load_key",
                "ensure_function",
                "try_ensure_bucket_and_keys",
                "find_function_id",
                "load_storage_env",
                "api",
                "ensure_gateway",
                "smoke",
                "KEY_PATH",
            )
            if hasattr(module, name)
        )


class _Restore:
    def __init__(self, module, originals, key_path):
        self.module = module
        self.originals = originals
        self.key_path = key_path

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        for name, value in self.originals.items():
            setattr(self.module, name, value)
        if self.key_path is not None:
            self.module.KEY_PATH = self.key_path
        return False


if __name__ == "__main__":
    unittest.main()
