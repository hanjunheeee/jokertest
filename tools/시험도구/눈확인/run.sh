#!/usr/bin/env bash
# 눈 확인 도구 실행기, e2e 잠금을 잡고 run.js를 돌리며 CPU를 5초마다 적음 (끝나면 평균·최고 한 줄)
# 사용: bash tools/시험도구/눈확인/run.sh [시작 번호] [--selfcheck] [--only 가,바-01] — 쓰는 법은 읽어보기.md
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS="$(cd "$HERE/.." && pwd)"
OUT="$TOOLS/.run/eyecheck"
mkdir -p "$OUT"

# 처음 부를 때만 e2e 잠금 안으로 다시 들어감 (브라우저 시험·다른 눈 확인과 안 겹치게)
if [ -z "${EYE_LOCKED:-}" ]; then
  export EYE_LOCKED=1 AGENT_NAME="${AGENT_NAME:-눈확인}"
  exec bash "$TOOLS/with-lock.sh" e2e bash "$HERE/run.sh" "$@"
fi

# CPU 5초마다 (PowerShell 한 번에 한 줄: 시각 CPU%)
: > "$OUT/cpu.txt"
( while :; do
    c="$(powershell -NoProfile -Command '[math]::Round((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average)' 2>/dev/null | tr -d '\r')"
    echo "$(date +%H:%M:%S) ${c:-0}" >> "$OUT/cpu.txt"
    sleep 5
  done ) &
MON=$!
trap 'kill $MON 2>/dev/null' EXIT

# 터미널에서 돌리면 Enter를 받음 (뒤에서 돌리면 신호 파일만)
node "$HERE/run.js" "$@"
rc=$?
kill $MON 2>/dev/null
awk '{n++; s+=$2; if ($2>m) m=$2} END {if (n) printf "CPU 평균 %d%% 최고 %d%% (표본 %d개, %s)\n", s/n, m, n, FILENAME}' "$OUT/cpu.txt"
exit $rc
