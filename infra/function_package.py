#!/usr/bin/env python3
"""Куда класть архив функции перед CreateVersion.

Прямое поле content — пока zip не больше ~3.5 МБ (лимит сообщения API,
на практике gRPC отвергает тело около 4 МиБ). Более крупный архив
записывается одним ключом в бакет материалов Yandex Object Storage и
передаётся как package. Других хранилищ нет: хост только
storage.yandexcloud.net.

Бакет данных (PARTNERS_BUCKET, multiframe-partner-data) не используется.
Ключ фиксированный и перезаписывается: _deploy/partner-api/function.zip.
Список материалов этот префикс не видит: materialsRoutes отдаёт
platform.materials, а ключ файла обязан совпадать с materials/mat_*.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import quote

# ~3.5 МБ. Сообщение CreateVersion упирается в 4 МиБ (4194304).
DIRECT_UPLOAD_MAX_BYTES = 3_500_000
# Лимит Yandex Cloud Functions для zip, который функция читает из бакета.
PACKAGE_UPLOAD_MAX_BYTES = 128 * 1024 * 1024
FUNCTION_OBJECT_KEY = "_deploy/partner-api/function.zip"
YC_STORAGE_HOST = "storage.yandexcloud.net"
YC_STORAGE_REGION = "ru-central1"
DATA_BUCKET_NAME = "multiframe-partner-data"
_BUCKET_RE_TEXT = r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"

# Тест подменяет открытие URL. В деплое остаётся None.
URL_OPENER = None


def assert_function_zip_allowed(zip_path: Path) -> str:
    """Вернуть 'content' или 'package'. SystemExit до загрузки, если архив нельзя отправить."""
    zip_path = Path(zip_path)
    if not zip_path.is_file():
        raise SystemExit(f"нет архива функции: {zip_path}")
    size = zip_path.stat().st_size
    with zipfile.ZipFile(zip_path) as zf:
        names = [info.filename for info in zf.infolist() if not info.is_dir()]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        sample = ", ".join(duplicates[:5])
        raise SystemExit(f"в архиве функции повторяются имена: {sample}")
    for name in names:
        for part in PurePosixPath(name).parts:
            if part == "playwright" or part.startswith("playwright"):
                raise SystemExit(
                    "архив функции содержит playwright "
                    f"({name}). devDependency в пакет деплоя не входит."
                )
    if size > PACKAGE_UPLOAD_MAX_BYTES:
        raise SystemExit(
            f"архив функции {size} байт больше лимита пакета Yandex Object Storage "
            f"({PACKAGE_UPLOAD_MAX_BYTES} байт, 128 МБ)."
        )
    if size <= DIRECT_UPLOAD_MAX_BYTES:
        mode = "content"
        path_name = "прямое тело запроса"
    else:
        mode = "package"
        path_name = "пакет Yandex Object Storage"
    print(
        f"архив функции: {size} байт; "
        f"лимит прямой загрузки {DIRECT_UPLOAD_MAX_BYTES}; "
        f"выбран путь: {path_name}"
    )
    return mode


def build_version_source(
    zip_path: Path,
    storage_env: dict[str, str],
    mode: str,
) -> dict:
    """Поля CreateVersion: content либо package. Секреты не печатает."""
    zip_path = Path(zip_path)
    if mode == "content":
        print(f"путь загрузки: прямое тело запроса, {zip_path.stat().st_size} байт")
        return {"content": base64.b64encode(zip_path.read_bytes()).decode()}
    if mode != "package":
        raise SystemExit(f"неизвестный путь загрузки: {mode}")
    bucket, access_key, secret_key = _package_credentials(storage_env)
    digest = upload_function_zip(
        zip_path,
        bucket=bucket,
        access_key=access_key,
        secret_key=secret_key,
    )
    print(
        "путь загрузки: пакет в Yandex Object Storage "
        f"({YC_STORAGE_HOST}), ключ {FUNCTION_OBJECT_KEY}, "
        f"{zip_path.stat().st_size} байт"
    )
    return {
        "package": {
            "bucketName": bucket,
            "objectName": FUNCTION_OBJECT_KEY,
            "sha256": digest,
        }
    }


def upload_function_zip(
    zip_path: Path,
    *,
    bucket: str,
    access_key: str,
    secret_key: str,
    partners_bucket: str = "",
) -> str:
    """PUT архива на storage.yandexcloud.net. Вернуть hex SHA-256 тела."""
    bucket = _reject_data_bucket(bucket, partners_bucket)
    if not access_key or not secret_key:
        raise SystemExit(
            "Для пакета в Object Storage нужны YC_ACCESS_KEY_ID и YC_SECRET_ACCESS_KEY. "
            "Значения не печатаются."
        )
    body = Path(zip_path).read_bytes()
    payload_hash = hashlib.sha256(body).hexdigest()
    amz_date = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    url = _object_url(bucket, FUNCTION_OBJECT_KEY)
    headers = {
        "Content-Type": "application/zip",
        "Host": YC_STORAGE_HOST,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    signed = dict(headers)
    signed["Authorization"] = _authorization(
        method="PUT",
        canonical_uri=_canonical_uri(bucket, FUNCTION_OBJECT_KEY),
        headers=headers,
        payload_hash=payload_hash,
        access_key=access_key,
        secret_key=secret_key,
        region=YC_STORAGE_REGION,
        service="s3",
        amz_date=amz_date,
    )
    request = urllib.request.Request(url, data=body, method="PUT", headers=signed)
    opener = URL_OPENER or _yandex_opener().open
    try:
        response = opener(request, timeout=180)
    except urllib.error.HTTPError as exc:
        detail = _redact(exc.read().decode("utf-8", "replace")[:800], access_key, secret_key)
        code = _xml_text(detail, "Code") or str(exc.code)
        message = _xml_text(detail, "Message") or ""
        raise SystemExit(
            f"не удалось записать архив в Yandex Object Storage: {code} {message}".rstrip()
        ) from None
    except urllib.error.URLError as exc:
        reason = _redact(str(exc.reason), access_key, secret_key)
        raise SystemExit(f"не удалось записать архив в Yandex Object Storage: {reason}") from None
    status = getattr(response, "status", None)
    if hasattr(response, "__enter__"):
        with response:
            status = getattr(response, "status", status)
    if status not in (200, 201):
        raise SystemExit(f"не удалось записать архив в Yandex Object Storage: HTTP {status}")
    return payload_hash


def _package_credentials(storage_env: dict[str, str]) -> tuple[str, str, str]:
    env = storage_env or {}
    bucket = (env.get("MATERIALS_BUCKET") or os.environ.get("MATERIALS_BUCKET") or "").strip()
    partners = (env.get("PARTNERS_BUCKET") or os.environ.get("PARTNERS_BUCKET") or "").strip()
    access_key = env.get("YC_ACCESS_KEY_ID") or os.environ.get("YC_ACCESS_KEY_ID") or ""
    secret_key = env.get("YC_SECRET_ACCESS_KEY") or os.environ.get("YC_SECRET_ACCESS_KEY") or ""
    bucket = _reject_data_bucket(bucket, partners)
    if not access_key or not secret_key:
        raise SystemExit(
            "Для пакета в Object Storage нужны YC_ACCESS_KEY_ID и YC_SECRET_ACCESS_KEY. "
            "Значения не печатаются."
        )
    return bucket, access_key, secret_key


def _reject_data_bucket(bucket: str, partners_bucket: str) -> str:
    name = (bucket or "").strip()
    partners = (partners_bucket or "").strip()
    if not name:
        raise SystemExit(
            "Архив больше лимита прямой загрузки. Нужен MATERIALS_BUCKET "
            "(приватный бакет Yandex Object Storage). "
            "PARTNERS_BUCKET и multiframe-partner-data для архива функции не используются."
        )
    if name == DATA_BUCKET_NAME or (partners and name == partners):
        raise SystemExit(
            f"Отказ: архив функции не записывается в бакет данных ({name}). "
            "Укажите отдельный MATERIALS_BUCKET."
        )
    if ".." in name or not _bucket_ok(name):
        raise SystemExit(f"Некорректное имя MATERIALS_BUCKET: {name}")
    return name


def _bucket_ok(name: str) -> bool:
    return re.fullmatch(_BUCKET_RE_TEXT, name) is not None


def _object_url(bucket: str, key: str) -> str:
    return f"https://{YC_STORAGE_HOST}{_canonical_uri(bucket, key)}"


def _canonical_uri(bucket: str, key: str) -> str:
    parts = [_uri_encode(bucket), *(_uri_encode(part) for part in key.split("/"))]
    return "/" + "/".join(parts)


def _uri_encode(value: str) -> str:
    return quote(value, safe="-_.~")


def _authorization(
    *,
    method: str,
    canonical_uri: str,
    headers: dict[str, str],
    payload_hash: str,
    access_key: str,
    secret_key: str,
    region: str,
    service: str,
    amz_date: str,
) -> str:
    canonical_headers, signed_headers = _canonical_headers(headers)
    # CanonicalHeaders уже заканчивается переводом строки, поэтому перед
    # SignedHeaders получается пустая строка — так считает пример AWS SigV4.
    canonical_request = (
        f"{method}\n{canonical_uri}\n\n"
        f"{canonical_headers}\n"
        f"{signed_headers}\n"
        f"{payload_hash}"
    )
    datestamp = amz_date[:8]
    scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = (
        "AWS4-HMAC-SHA256\n"
        f"{amz_date}\n"
        f"{scope}\n"
        f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
    )
    signing_key = _signing_key(secret_key, datestamp, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    return (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{scope},"
        f"SignedHeaders={signed_headers},"
        f"Signature={signature}"
    )


def _canonical_headers(headers: dict[str, str]) -> tuple[str, str]:
    items = []
    for name, value in headers.items():
        lowered = name.lower().strip()
        if lowered == "authorization":
            continue
        cleaned = " ".join(value.strip().split())
        items.append((lowered, cleaned))
    items.sort()
    canonical = "".join(f"{name}:{value}\n" for name, value in items)
    signed = ";".join(name for name, _value in items)
    return canonical, signed


def _signing_key(secret_key: str, datestamp: str, region: str, service: str) -> bytes:
    date_key = _hmac(("AWS4" + secret_key).encode("utf-8"), datestamp)
    region_key = _hmac(date_key, region)
    service_key = _hmac(region_key, service)
    return _hmac(service_key, "aws4_request")


def _hmac(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


class _RefuseRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SystemExit(
            f"Object Storage вернул редирект {code}. "
            f"Загрузка идёт только на {YC_STORAGE_HOST}."
        )


def _yandex_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(_RefuseRedirect)


def _redact(text: str, access_key: str, secret_key: str) -> str:
    for secret in (secret_key, access_key):
        if secret:
            text = text.replace(secret, "***")
    return text


def _xml_text(body: str, tag: str) -> str:
    start = body.find(f"<{tag}>")
    end = body.find(f"</{tag}>")
    if start < 0 or end < 0:
        return ""
    return body[start + len(tag) + 2 : end].strip()
