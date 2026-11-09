#!/usr/bin/env bash
# 본보기 사본임: <임시 폴더>·<저장소>를 내 컴퓨터 경로로 바꿔 써야 함
# 공용 자원(시험 DB·브라우저 시험 서버 포트) 한 번에 한 에이전트만: mkdir 잠금, 끝나면 풂
# 사용: bash with-lock.sh <testdb|e2e> <명령...>
name="$1"; shift
dir="<임시 폴더>/locks/$name.lock"
mkdir -p "$(dirname "$dir")"
waited=0
until mkdir "$dir" 2>/dev/null; do
  # 2시간 넘은 잠금은 죽은 것으로 보고 치움
  if [ -n "$(find "$dir" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then rmdir "$dir" 2>/dev/null; continue; fi
  [ $((waited % 60)) -eq 0 ] && echo "[잠금 대기] $name ($(cat "$dir/owner" 2>/dev/null)) ${waited}초"
  sleep 5; waited=$((waited+5))
done
echo "${AGENT_NAME:-agent} $(date +%H:%M)" > "$dir/owner"
trap 'rm -f "$dir/owner"; rmdir "$dir" 2>/dev/null' EXIT
"$@"
