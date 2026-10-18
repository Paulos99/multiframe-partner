#!/usr/bin/env python3
"""Один состав архива Cloud Function для обоих скриптов деплоя.

В архив входят:
- все apps/api/**/*.js и *.mjs, кроме тестов (*.test.*) и каталога scripts/;
- apps/api/package.json и lock-файл;
- локальные модули, которые эти файлы импортируют снаружи apps/api
  (относительный путь импорта сохраняется).

node_modules в архив деплоя добавляется отдельно и в это правило не входит.
Берутся только production-зависимости: каталоги, которые lock помечает
"dev": true (в том числе playwright), в архив не попадают. Симлинки и
каталог .bin не пишутся — иначе cli.js и bin/bcrypt попадают в zip дважды.
Точка входа остаётся index.handler, пока все файлы лежат внутри apps/api.
Если сервер импортирует код выше apps/api, корень архива поднимается до корня
репозитория, а точка входа становится apps/api/index.handler.
"""
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
SOURCE_SUFFIXES = {".js", ".mjs"}
PARSE_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts"}
RESOLVE_SUFFIXES = (".js", ".mjs", ".cjs", ".json", ".ts", ".tsx", ".mts")
LOCK_NAMES = ("package-lock.json", "npm-shrinkwrap.json")

# from './x' покрывает import/export, в том числе многострочные списки имён.
# Отдельно — голый import './x' и динамический import('./x').
_FROM_RE = re.compile(r"""\bfrom\s+['"]([^'"]+)['"]""")
_DYN_RE = re.compile(r"""\bimport\s*\(\s*['"]([^'"]+)['"]""")
_BARE_RE = re.compile(r"""(?:^|[^\w$])import\s+['"]([^'"]+)['"]""")


@dataclass(frozen=True)
class FunctionBundle:
    """Собранный архив. api_files — пути относительно apps/api."""

    zip_path: Path
    entrypoint: str
    entry_file: str
    package_dir: str
    api_files: tuple[str, ...]
    outside_api: tuple[str, ...]


def build_function_zip(
    dest: Path,
    *,
    include_node_modules: bool = True,
    root: Path | None = None,
) -> FunctionBundle:
    repo = (root or ROOT).resolve()
    api = (repo / "apps" / "api").resolve()
    files = collect_bundle_files(repo, api)
    zip_root = choose_zip_root(files, api, repo)
    entry = function_entry(api)
    dest = Path(dest)
    if dest.exists():
        dest.unlink()
    dest.parent.mkdir(parents=True, exist_ok=True)

    api_files: list[str] = []
    outside: list[str] = []
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        seen: set[str] = set()
        for path in files:
            name = archive_name(path, zip_root)
            if name in seen:
                continue
            seen.add(name)
            zf.write(path, name)
            if _is_relative_to(path, api):
                api_files.append(path.resolve().relative_to(api).as_posix())
            else:
                outside.append(path.resolve().relative_to(repo).as_posix())
        if include_node_modules:
            _add_node_modules(zf, api, zip_root, seen)

    entry_file = archive_name(entry, zip_root)
    package_dir = "." if zip_root == api else api.relative_to(zip_root).as_posix()
    return FunctionBundle(
        zip_path=dest,
        entrypoint=_entrypoint_name(entry_file),
        entry_file=entry_file,
        package_dir=package_dir,
        api_files=tuple(sorted(api_files)),
        outside_api=tuple(sorted(outside)),
    )


def collect_bundle_files(repo: Path, api: Path) -> list[Path]:
    sources = list_api_sources(api)
    if not sources:
        raise SystemExit(f"в {api} нет серверных модулей .js/.mjs")
    extra = follow_local_imports(sources, repo, api)
    manifests = manifest_files(api)
    unique: dict[Path, None] = {}
    for path in [*sources, *extra, *manifests]:
        unique[path.resolve()] = None
    return sorted(unique, key=lambda path: path.as_posix())


def list_api_sources(api: Path) -> list[Path]:
    found: list[Path] = []
    if not api.is_dir():
        raise SystemExit(f"нет каталога API: {api}")
    for path in api.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(api)
        if "node_modules" in rel.parts or "scripts" in rel.parts:
            continue
        if ".test." in path.name:
            continue
        if path.suffix not in SOURCE_SUFFIXES:
            continue
        found.append(path.resolve())
    return sorted(found, key=lambda path: path.as_posix())


def manifest_files(api: Path) -> list[Path]:
    package_json = api / "package.json"
    if not package_json.is_file():
        raise SystemExit(f"нет {package_json}")
    lock = next((api / name for name in LOCK_NAMES if (api / name).is_file()), None)
    if lock is None:
        raise SystemExit(
            "нет apps/api/package-lock.json (или npm-shrinkwrap.json); "
            "без lock архив функции не собирается"
        )
    return [package_json.resolve(), lock.resolve()]


def follow_local_imports(sources: list[Path], repo: Path, api: Path) -> list[Path]:
    """Добрать файлы вне правила apps/api, если сервер импортирует их относительно."""
    seen = {path.resolve() for path in sources}
    queue = list(sources)
    extra: list[Path] = []
    node_modules = (api / "node_modules").resolve()
    while queue:
        current = queue.pop()
        if current.suffix not in PARSE_SUFFIXES:
            continue
        text = strip_js_comments(current.read_text(encoding="utf-8"))
        for spec in relative_specifiers(text):
            resolved = resolve_relative(current, spec)
            if resolved is None:
                raise SystemExit(
                    f"{current.relative_to(repo)}: не найден локальный импорт {spec}"
                )
            resolved = resolved.resolve()
            if resolved in seen:
                continue
            if _is_relative_to(resolved, node_modules):
                continue
            if not _is_relative_to(resolved, repo):
                raise SystemExit(
                    f"{current.relative_to(repo)}: импорт {spec} выходит за репозиторий"
                )
            seen.add(resolved)
            extra.append(resolved)
            queue.append(resolved)
    return extra


def relative_specifiers(text: str) -> list[str]:
    found: list[str] = []
    for pattern in (_FROM_RE, _DYN_RE, _BARE_RE):
        for match in pattern.finditer(text):
            spec = match.group(1).strip()
            if not spec.startswith(".") or "${" in spec:
                continue
            found.append(spec)
    return found


def resolve_relative(from_file: Path, spec: str) -> Path | None:
    raw = (from_file.parent / spec).resolve()
    if raw.suffix:
        return raw if raw.is_file() else None
    candidates = [raw.with_suffix(ext) for ext in RESOLVE_SUFFIXES]
    candidates.extend(raw / f"index{ext}" for ext in (".js", ".mjs", ".cjs", ".json"))
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def strip_js_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    lines: list[str] = []
    for line in text.splitlines():
        quote: str | None = None
        cut: int | None = None
        i = 0
        while i < len(line):
            ch = line[i]
            if quote:
                if ch == "\\":
                    i += 2
                    continue
                if ch == quote:
                    quote = None
                i += 1
                continue
            if ch in "'\"`":
                quote = ch
                i += 1
                continue
            if ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                cut = i
                break
            i += 1
        lines.append(line if cut is None else line[:cut])
    return "\n".join(lines)


def function_entry(api: Path) -> Path:
    for name in ("index.js", "index.mjs"):
        path = api / name
        if path.is_file():
            return path.resolve()
    raise SystemExit(f"нет точки входа index.js/index.mjs в {api}")


def choose_zip_root(files: list[Path], api: Path, repo: Path) -> Path:
    api_root = api.resolve()
    for path in files:
        if not _is_relative_to(path, api_root):
            return repo.resolve()
    return api_root


def archive_name(path: Path, zip_root: Path) -> str:
    name = path.resolve().relative_to(zip_root.resolve()).as_posix()
    if not name or name.startswith("/") or ".." in Path(name).parts:
        raise SystemExit(f"небезопасное имя в архиве: {name}")
    return name


def _entrypoint_name(entry_file: str) -> str:
    for suffix in (".mjs", ".js"):
        if entry_file.endswith(suffix):
            return f"{entry_file[: -len(suffix)]}.handler"
    raise SystemExit(f"неподдерживаемая точка входа: {entry_file}")


def _add_node_modules(
    zf: zipfile.ZipFile,
    api: Path,
    zip_root: Path,
    seen: set[str],
) -> None:
    node_modules = api / "node_modules"
    if not node_modules.is_dir():
        raise SystemExit("Run npm install in apps/api first")
    dev_roots = _dev_package_roots(api)
    for path in node_modules.rglob("*"):
        # .bin/playwright и .bin/bcrypt — симлинки на cli.js и bin/bcrypt.
        # resolve() склеивает их в одно имя, и ZipFile пишет его второй раз.
        if path.is_symlink() or not path.is_file():
            continue
        rel_in_modules = path.relative_to(node_modules)
        if ".bin" in rel_in_modules.parts:
            continue
        rel = path.resolve().relative_to(api.resolve()).as_posix()
        if _under_any(rel, dev_roots):
            continue
        name = archive_name(path, zip_root)
        if name in seen:
            continue
        seen.add(name)
        zf.write(path, name)


def _dev_package_roots(api: Path) -> set[str]:
    """Пути lock-файла вроде node_modules/playwright с пометкой dev."""
    lock = next((api / name for name in LOCK_NAMES if (api / name).is_file()), None)
    if lock is None:
        raise SystemExit("нет lock-файла, нельзя отделить devDependencies")
    try:
        data = json.loads(lock.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"не читается {lock.name}: {exc}") from exc
    packages = data.get("packages")
    if not isinstance(packages, dict):
        raise SystemExit(f"{lock.name}: нет объекта packages, архив функции не собирается")
    roots: set[str] = set()
    for rel, meta in packages.items():
        if not isinstance(meta, dict) or meta.get("dev") is not True:
            continue
        norm = str(rel).strip("/")
        if norm == "node_modules" or norm.startswith("node_modules/"):
            roots.add(norm)
    return roots


def _under_any(rel: str, roots: set[str]) -> bool:
    for root in roots:
        if rel == root or rel.startswith(root + "/"):
            return True
    return False


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True
