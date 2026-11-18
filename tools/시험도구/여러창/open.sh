#!/usr/bin/env bash
# 직접 해 보기용 여러 사람 창 열기 (open.js를 부름) — 사용: bash tools/시험도구/여러창/open.sh 2 3 4 5
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/open.js" "$@"
