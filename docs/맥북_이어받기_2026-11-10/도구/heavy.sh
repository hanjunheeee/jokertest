#!/usr/bin/env bash
# 본보기 사본임: <임시 폴더>·<저장소>를 내 컴퓨터 경로로 바꿔 써야 함
# 무거운 일(전체 시험·빌드) 동시에 3개까지만 + CPU 90% 넘으면 내려갈 때까지 기다림
# 사용: AGENT_NAME=<이름> bash heavy.sh <명령...>
base="<임시 폴더>/locks"
mkdir -p "$base"; got=""; waited=0
cpu() { powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average)" 2>/dev/null | tr -d '\r'; }
while [ -z "$got" ]; do
  for i in 1 2 3; do
    d="$base/heavy-$i.lock"
    [ -n "$(find "$d" -maxdepth 0 -mmin +60 2>/dev/null)" ] && { rm -f "$d/owner"; rmdir "$d" 2>/dev/null; }
    if mkdir "$d" 2>/dev/null; then got="$d"; break; fi
  done
  if [ -n "$got" ]; then
    c=$(cpu); if [ "${c:-0}" -ge 90 ] && [ $waited -lt 600 ]; then rm -f "$got/owner"; rmdir "$got"; got=""; fi
  fi
  if [ -z "$got" ]; then [ $((waited % 60)) -eq 0 ] && echo "[무거운 일 대기] 자리 없음 또는 CPU 높음 ${waited}초"; sleep 10; waited=$((waited+10)); fi
done
echo "${AGENT_NAME:-agent} $(date +%H:%M)" > "$got/owner"
trap 'rm -f "$got/owner"; rmdir "$got" 2>/dev/null' EXIT
"$@"
