#!/usr/bin/env bash
# 시험 한 묶음 돌리기 (켜 둔 서버 씀), 사용: run.sh <이름> <일꾼 수> [playwright 인자...]
# 기록은 tools/시험도구/.run/묶음돌리기/ 아래 (<이름>.log·<이름>.json·parts.txt)
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
B="$HERE/../.run/묶음돌리기"
mkdir -p "$B"
BW="$(cygpath -m "$B" 2>/dev/null || echo "$B")"
cd "$ROOT/e2e" || exit 1
export E2E_REUSE=1 E2E_FRONT=build E2E_FRONT_REBUILD=0
name=$1; w=$2; shift 2
if [ -z "$name" ] || [ -z "$w" ]; then echo "쓰는 법: run.sh <이름> <일꾼 수 1|2> [playwright 인자...]"; exit 1; fi
# 일꾼은 2까지 (CPU 규칙)
if [ "$w" -gt 2 ]; then w=2; fi
# 시작 전 CPU 85% 아래·남은 메모리 4GB 위까지 기다림
powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/waitcpu.ps1" 2>/dev/null || echo "$HERE/waitcpu.ps1")" | tail -1 | tr -d '\r' > "$B/$name.wait"
export E2E_RUN_ID="b${name//[^a-z0-9]/}$(date +%H%M%S)" E2E_OUTPUT_DIR="test-results/b-$name"
echo "[$name] start $(date +%H:%M:%S) workers=$w $(cat "$B/$name.wait")" >> "$B/parts.txt"
PLAYWRIGHT_JSON_OUTPUT_FILE="$BW/$name.json" npx playwright test --no-deps --retries=0 --workers=$w --reporter=line,json "$@" > "$B/$name.log" 2>&1
rc=$?
echo "[$name] end $(date +%H:%M:%S) rc=$rc" >> "$B/parts.txt"
sed 's/\x1b\[[0-9;]*m//g' "$B/$name.log" | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped|did not run)|^\s+[0-9]+\) \[" | cut -c1-200
exit 0
