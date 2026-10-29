#!/usr/bin/env bash
# Откат на предыдущий установленный выпуск. Можно указать метку явно: ./deploy/rollback.sh v1.1.0
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$(cat "$ROOT/.release/previous" 2>/dev/null || true)}"
if [[ -z "$TARGET" ]]; then
  echo "Предыдущий выпуск неизвестен. Укажите метку: $0 vX.Y.Z" >&2
  exit 1
fi
FORCE=1 NO_AUTO_ROLLBACK=1 exec "$ROOT/deploy/release.sh" "$TARGET"
