#!/usr/bin/env python3
"""Оба скрипта деплоя проверяют переданный архив до загрузки в Yandex Cloud.

Сломанный zip: импорт падает, заглушка загрузки не вызывается.
Целый zip: проверка проходит, заглушка загрузки получает тот же путь.
Слишком большой zip и playwright останавливают процесс до загрузки.
Сеть и облачные ключи не используются.
"""
from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

import deploy_yc
import function_package
import mf_doh_patch_deploy
from function_bundle import FunctionBundle, build_function_zip
from function_package import (
    DATA_BUCKET_NAME,
    FUNCTION_OBJECT_KEY,
    YC_STORAGE_HOST,
    _authorization,
    build_version_source,
)

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
            self.assertIn("content", upload_calls[0][3])
            self.assertNotIn("package", upload_calls[0][3])
            self.assertLess(calls.index(verify_calls[0]), calls.index(upload_calls[0]))

    def test_both_deploys_reject_playwright_before_upload(self) -> None:
        for module in (deploy_yc, mf_doh_patch_deploy):
            with self.subTest(module=module.__name__):
                self._assert_rejected(module, playwright=True, limit=None, needle="playwright")

    def test_both_deploys_reject_zip_over_package_limit_before_upload(self) -> None:
        for module in (deploy_yc, mf_doh_patch_deploy):
            with self.subTest(module=module.__name__):
                self._assert_rejected(module, playwright=False, limit=80, needle="128")

    def test_package_path_uses_only_yandex_materials_bucket(self) -> None:
        access = "YCAJEaccess-key-example"
        secret = "super-secret-value-not-for-logs"
        materials = "multiframe-partner-materials"
        captured: list = []

        def opener(request, timeout=0):
            captured.append(request)
            return _FakeResponse()

        previous = function_package.URL_OPENER
        previous_limit = function_package.DIRECT_UPLOAD_MAX_BYTES
        function_package.URL_OPENER = opener
        function_package.DIRECT_UPLOAD_MAX_BYTES = 1
        try:
            for module in (deploy_yc, mf_doh_patch_deploy):
                with self.subTest(module=module.__name__):
                    captured.clear()
                    with tempfile.TemporaryDirectory() as tmp_name:
                        zip_path = Path(tmp_name) / "function.zip"
                        write_zip(zip_path, GOOD_INDEX)
                        calls: list[tuple] = []
                        storage = {
                            "PARTNERS_BUCKET": "partners-data-bucket",
                            "MATERIALS_BUCKET": materials,
                            "YC_ACCESS_KEY_ID": access,
                            "YC_SECRET_ACCESS_KEY": secret,
                        }
                        stdout = io.StringIO()
                        with self._cloud_stubs(module, bundle_for(zip_path), calls, storage):
                            with contextlib.redirect_stdout(stdout):
                                module.main()
                        text = stdout.getvalue()
                        self.assertNotIn(secret, text)
                        self.assertNotIn(access, text)
                        self.assertIn("Yandex Object Storage", text)
                        self.assertNotIn(DATA_BUCKET_NAME, text)
                        upload_calls = [item for item in calls if item[0] == "create_version"]
                        source = upload_calls[0][3]
                        self.assertEqual(
                            source["package"],
                            {
                                "bucketName": materials,
                                "objectName": FUNCTION_OBJECT_KEY,
                                "sha256": source["package"]["sha256"],
                            },
                        )
                        self.assertNotIn("content", source)
                        self.assertEqual(len(captured), 1)
                        request = captured[0]
                        self.assertEqual(request.method, "PUT")
                        self.assertTrue(request.full_url.startswith(f"https://{YC_STORAGE_HOST}/"))
                        self.assertIn(f"/{materials}/{FUNCTION_OBJECT_KEY}", request.full_url)
                        self.assertNotIn("partners-data-bucket", request.full_url)
                        host = request.get_header("Host")
                        self.assertEqual(host, YC_STORAGE_HOST)
        finally:
            function_package.URL_OPENER = previous
            function_package.DIRECT_UPLOAD_MAX_BYTES = previous_limit

    def test_package_path_refuses_data_buckets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_name:
            zip_path = Path(tmp_name) / "function.zip"
            write_zip(zip_path, GOOD_INDEX)
            for bucket in (DATA_BUCKET_NAME, "partners-data-bucket"):
                with self.subTest(bucket=bucket):
                    with self.assertRaises(SystemExit) as caught:
                        build_version_source(
                            zip_path,
                            {
                                "MATERIALS_BUCKET": bucket,
                                "PARTNERS_BUCKET": "partners-data-bucket",
                                "YC_ACCESS_KEY_ID": "id",
                                "YC_SECRET_ACCESS_KEY": "secret",
                            },
                            "package",
                        )
                    self.assertIn("бакет данных", str(caught.exception))

    def test_aws_sigv4_get_object_vector(self) -> None:
        headers = {
            "Host": "examplebucket.s3.amazonaws.com",
            "Range": "bytes=0-9",
            "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "x-amz-date": "20130524T000000Z",
        }
        header = _authorization(
            method="GET",
            canonical_uri="/test.txt",
            headers=headers,
            payload_hash=headers["x-amz-content-sha256"],
            access_key="AKIAIOSFODNN7EXAMPLE",
            secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            region="us-east-1",
            service="s3",
            amz_date="20130524T000000Z",
        )
        self.assertTrue(
            header.endswith(
                "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
            )
        )

    def test_bundle_skips_dev_dependencies_and_duplicate_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_name:
            root = Path(tmp_name)
            api = root / "apps" / "api"
            modules = api / "node_modules"
            (modules / "bcryptjs" / "bin").mkdir(parents=True)
            (modules / "playwright").mkdir()
            (modules / "playwright-core").mkdir()
            (modules / ".bin").mkdir()
            (api / "index.js").write_text(GOOD_INDEX, encoding="utf-8")
            (api / "package.json").write_text(PACKAGE_JSON + "\n", encoding="utf-8")
            lock = {
                "name": "mf-bundle-guard",
                "lockfileVersion": 3,
                "requires": True,
                "packages": {
                    "": {"name": "mf-bundle-guard"},
                    "node_modules/bcryptjs": {"version": "3.0.3"},
                    "node_modules/playwright": {"version": "1.56.1", "dev": True},
                    "node_modules/playwright-core": {"version": "1.56.1", "dev": True},
                },
            }
            (api / "package-lock.json").write_text(json.dumps(lock), encoding="utf-8")
            bcrypt = modules / "bcryptjs" / "bin" / "bcrypt"
            bcrypt.write_text("#!/usr/bin/env node\n", encoding="utf-8")
            (modules / "playwright" / "cli.js").write_text("playwright\n", encoding="utf-8")
            (modules / "playwright-core" / "cli.js").write_text("core\n", encoding="utf-8")
            (modules / ".bin" / "bcrypt").symlink_to("../bcryptjs/bin/bcrypt")
            (modules / ".bin" / "playwright").symlink_to("../playwright/cli.js")
            dest = root / "function.zip"
            with warnings.catch_warnings():
                warnings.simplefilter("error", UserWarning)
                bundle = build_function_zip(dest, include_node_modules=True, root=root)
            with zipfile.ZipFile(dest) as zf:
                names = zf.namelist()
            self.assertEqual(len(names), len(set(names)))
            self.assertIn("node_modules/bcryptjs/bin/bcrypt", names)
            self.assertFalse(any("playwright" in name for name in names))
            self.assertNotIn("node_modules/.bin/bcrypt", names)
            self.assertIn("index.js", bundle.api_files)

    def test_materials_listing_does_not_see_deploy_prefix(self) -> None:
        api = Path(__file__).resolve().parents[1] / "apps" / "api"
        text = "\n".join(path.read_text(encoding="utf-8") for path in sorted(api.glob("*.js")))
        self.assertNotIn("ListObjects", text)
        self.assertNotRegex(FUNCTION_OBJECT_KEY, r"(?i)^materials/mat_[a-z0-9_]+$")
        self.assertTrue(FUNCTION_OBJECT_KEY.startswith("_deploy/"))

    def _assert_rejected(self, module, *, playwright: bool, limit: int | None, needle: str) -> None:
        previous = function_package.PACKAGE_UPLOAD_MAX_BYTES
        if limit is not None:
            function_package.PACKAGE_UPLOAD_MAX_BYTES = limit
        try:
            with tempfile.TemporaryDirectory() as tmp_name:
                zip_path = Path(tmp_name) / "function.zip"
                write_zip(zip_path, GOOD_INDEX)
                if playwright:
                    with zipfile.ZipFile(zip_path, "a") as zf:
                        zf.writestr("node_modules/playwright/cli.js", "nope\n")
                calls: list[tuple] = []
                with self._cloud_stubs(module, bundle_for(zip_path), calls):
                    with self.assertRaises(SystemExit) as caught:
                        module.main()
                self.assertIn(needle, str(caught.exception))
                self.assertFalse(any(item[0] == "create_version" for item in calls))
                self.assertFalse(any(item[0] == "verify" for item in calls))
        finally:
            function_package.PACKAGE_UPLOAD_MAX_BYTES = previous

    def _cloud_stubs(self, module, bundle: FunctionBundle, calls: list[tuple], storage_env=None):
        originals = {name: getattr(module, name) for name in self._stub_names(module)}
        originals["verify_function_zip"] = module.verify_function_zip
        originals["make_zip"] = module.make_zip

        def verify(zip_path, *, entry_file):
            calls.append(("verify", Path(zip_path).resolve(), entry_file))
            return originals["verify_function_zip"](zip_path, entry_file=entry_file)

        def create_version(token, function_id, zip_path, storage_env, entrypoint, source):
            calls.append(("create_version", Path(zip_path).resolve(), entrypoint, source))
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
            "try_ensure_bucket_and_keys": record("try_ensure_bucket_and_keys", storage_env or {}),
            "find_function_id": record("find_function_id", "function-stub"),
            "load_storage_env": record("load_storage_env", storage_env or {}),
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


class _FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


if __name__ == "__main__":
    unittest.main()
