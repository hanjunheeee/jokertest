#!/usr/bin/env bash
# 브라우저 시험 "한 번만" 실행기(2026-11-16), 단계별로 돌리고 결과 JSON·로그·CPU 기록을 한 폴더에 모음 — 쓰는 법은 docs/게임_의도_2026-11-15/브라우저_실행_준비.md
# 사용: bash tools/시험도구/br/once.sh <단계…>
#   단계: check · sample · smoke · rest · serial · mn · mnserial · after · rerun / all = check~after 차례로 (rerun은 따로)
#   e2e 잠금(with-lock.sh e2e)을 스스로 잡음, 결과 폴더 BR_OUT(기본 tools/시험도구/.run/br-once/<오늘 날짜>)
#   바꿀 값: BR_WORKERS(6, 8까지) · BR_MIN_DISK_GB(20) · BR_SMOKE_MAX_FAIL(20%) · BR_REST_MAX_FAIL(30%) · BR_FORCE=1(이미 돈 단계 다시)
# 안 건드리는 것: 4000번 포트·개발 DB·Docker 켜고 끄기(상태 확인만)·시험과 도우미 코드 / 옛 run-phase.sh·all.sh는 그대로 둠
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS="$(cd "$HERE/.." && pwd)"
E2E="$(cd "$TOOLS/../../e2e" && pwd)"
LOCK="$TOOLS/.run/locks/e2e.lock"

# 처음 부를 때만 e2e 잠금 안으로 다시 들어감 (부하·다른 브라우저 실행과 안 겹치게)
if [ -z "${BR_LOCKED:-}" ]; then
  export BR_LOCKED=1 AGENT_NAME="${AGENT_NAME:-브라우저-한번}"
  exec bash "$TOOLS/with-lock.sh" e2e bash "$HERE/once.sh" "$@"
fi

win() { cygpath -m "$1" 2>/dev/null || printf '%s' "$1"; }
OUT="${BR_OUT:-$TOOLS/.run/br-once/$(date +%Y%m%d)}"
mkdir -p "$OUT"
# 시험은 e2e 폴더에서 돌아서 상대 경로면 엉뚱한 데 씀 → 늘 절대 경로로
OUT="$(cd "$OUT" && pwd)"
OUTW="$(win "$OUT")"
W_START="${BR_WORKERS:-6}"
PAR=(--project=desktop --project=mobile --project=mobile-safari --project=admin --project=admin-phone)

say() { echo "[$(date +%m-%d\ %H:%M:%S)] $*" | tee -a "$OUT/timeline.txt"; }
# CPU %·남은 메모리 GB 한 줄 (PowerShell 한 번)
cpu_mem() { powershell -NoProfile -Command '$c=[math]::Round((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average); $m=[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,1); "$c $m"' 2>/dev/null | tr -d '\r'; }
cpu_now() { cpu_mem | awk '{print $1+0}'; }

# 잠금 살려 두기: with-lock.sh는 2시간 넘은 잠금을 죽은 것으로 치움 → 5분마다 잠금 폴더 시각만 새로 (폴더가 없으면 안 만듦)
( while sleep 300; do [ -d "$LOCK" ] && touch -c "$LOCK"; done ) &
BEAT=$!
trap 'kill $BEAT 2>/dev/null' EXIT

# ---------- 확인 (읽기만) ----------
ports_busy() { netstat -ano 2>/dev/null | grep LISTENING | grep -E ":(41[0-9][0-9]|420[0-9]|527[3-5]) " | awk '{print $2}' | sort -u | tr '\n' ' '; }
disk_free_gb() { df -P -k "$E2E" | awk 'NR==2{print int($4/1048576)}'; }
docker_state() { docker inspect -f '{{.State.Status}} paused={{.State.Paused}}' "$1" 2>/dev/null | tr -d '\r'; }

# 단계 앞 확인: 포트 비었나·디스크·Docker (서버 2대면 시험 Redis도) — 하나라도 아니면 멈춤
pre_checks() {
  local nodes=$1 busy free db rd
  busy="$(ports_busy)"
  if [ -n "$busy" ]; then say "멈춤: 시험 포트를 누가 쓰는 중 → $busy (부하·다른 실행이 끝났는지 볼 것, 4000번은 안 봄)"; return 1; fi
  free="$(disk_free_gb)"
  if [ "${free:-0}" -lt "${BR_MIN_DISK_GB:-20}" ]; then say "멈춤: 디스크 남은 ${free}GB < ${BR_MIN_DISK_GB:-20}GB"; return 1; fi
  db="$(docker_state jokertest-db-1)"
  if [ "$db" != "running paused=false" ]; then say "멈춤: DB 컨테이너 jokertest-db-1 상태 '${db:-없음/Docker 꺼짐}' → 사용자에게 물을 것 (켜지 않음)"; return 1; fi
  if [ "$nodes" = 2 ]; then
    rd="$(docker_state mmc-redis-test)"
    if [ "$rd" != "running paused=false" ]; then say "멈춤: 시험 Redis mmc-redis-test 상태 '${rd:-없음}' → 사용자에게 물을 것 (켜지 않음, 이대로 돌리면 시험 틀이 docker start를 부름)"; return 1; fi
  fi
  return 0
}

# CPU가 높으면(남의 일) 내려갈 때까지 기다림
wait_cpu() {
  local limit=$1 max=$2 waited=0 c
  c="$(cpu_now)"
  while [ "${c:-0}" -ge "$limit" ] && [ $waited -lt "$max" ]; do
    [ $((waited % 120)) -eq 0 ] && say "CPU ${c}% ≥ ${limit}% → 내려가길 기다림 (${waited}초)"
    sleep 20; waited=$((waited + 20)); c="$(cpu_now)"
  done
  say "시작 전 CPU ${c}% (기다림 ${waited}초)"
}

# 앞 단계 CPU 기록으로 다음 작업자 수 정함: 95% 넘은 표본이 1/3 넘거나 남은 메모리 3GB 밑이 있었으면 2 줄임(3 밑으로는 안 감)
next_workers() {
  local w; w="$(cat "$OUT/workers.txt" 2>/dev/null || echo "$W_START")"
  local last; last="$(ls -t "$OUT"/cpu-*.txt 2>/dev/null | head -1)"
  if [ -n "$last" ]; then
    local verdict
    verdict="$(awk '{n++; if ($2>=95) hi++; if ($3<3) low++} END {if (n>0 && (hi*3>n || low>0)) print "down"; else print "keep"}' "$last")"
    if [ "$verdict" = down ] && [ "$w" -gt 3 ]; then w=$((w - 2)); [ "$w" -lt 3 ] && w=3; say "작업자 수 ${w}로 줄임 (앞 단계 CPU 95%↑가 1/3 넘음 또는 메모리 3GB 밑)"; fi
  fi
  [ "$w" -gt 8 ] && w=8
  echo "$w" > "$OUT/workers.txt"
  echo "$w"
}

cpu_stats() { awk '{n++; s+=$2; if ($2>m) m=$2; if ($2>=95) hi++} END {if (n) printf "CPU 평균 %d%% 최고 %d%% 95%%넘음 %d/%d", s/n, m, hi, n; else print "CPU 기록 없음"}' "$1" 2>/dev/null; }

# ---------- 한 단계 돌리기 ----------
# run_pw <이름> <서버 수> <작업자> <playwright 인자…>
run_pw() {
  local name=$1 nodes=$2 w=$3; shift 3
  if [ -f "$OUT/$name.json" ] && [ -z "${BR_FORCE:-}" ]; then say "[$name] 이미 돌림 → 건너뜀 (한 번만 원칙, 다시는 BR_FORCE=1)"; return 0; fi
  pre_checks "$nodes" || return 2
  wait_cpu 85 600
  say "[$name] 시작: 서버 ${nodes}대, 작업자 ${w}, 인자 $*"
  ( while :; do echo "$(date +%H:%M:%S) $(cpu_mem)" >> "$OUT/cpu-$name.txt"; sleep 30; done ) &
  local mon=$!
  local start; start=$(date +%s)
  # 환경값을 정해 줌: 빌드본(코드가 새로우면 저절로 다시 빌드)·node 앞단·docker Redis(A17 멈춤 시험용, E2E_REDIS_URL 안 줌)
  ( cd "$E2E" && env -u E2E_REDIS_URL -u E2E_REUSE -u E2E_KEEP_ACCOUNTS -u E2E_OUTSIDE_ROUTE \
      E2E_NODES="$nodes" E2E_WORKERS="$w" E2E_FRONT=build E2E_FRONT_REBUILD=0 E2E_PROXY=node E2E_LB=rr \
      E2E_RUN_ID="br${name//-/}$(date +%H%M)" E2E_OUTPUT_DIR="$OUTW/$name-art" PLAYWRIGHT_JSON_OUTPUT_FILE="$OUTW/$name.json" \
      npx playwright test --no-deps --retries=0 --workers="$w" --reporter=list,json "$@" ) > "$OUT/$name.log" 2>&1
  local rc=$?
  kill $mon 2>/dev/null
  say "[$name] 끝 rc=$rc 걸린 $(( ($(date +%s) - start) / 60 ))분 · $(cpu_stats "$OUT/cpu-$name.txt")"
  node "$HERE/summary.js" "$OUTW/$name.json" "$name" | tee -a "$OUT/timeline.txt"
  return 0
}

# 실패율(%) — <이름>.counts: 전체 통과 실패 건너뜀 흔들림 끊김
fail_pct() { awk '{ if ($1>0) print int(($3+$6)*100/$1); else print 100 }' "$OUT/$1.counts" 2>/dev/null || echo 100; }

# ---------- 단계 ----------
step_check() {
  say "== 0 환경 확인 =="
  local busy free db rd
  busy="$(ports_busy)"; free="$(disk_free_gb)"; db="$(docker_state jokertest-db-1)"; rd="$(docker_state mmc-redis-test)"
  say "포트(4100~4209·5273~5275): ${busy:-비어 있음} / 디스크 남은 ${free}GB / DB ${db:-없음} / 시험 Redis ${rd:-없음}"
  # 브라우저 설치: 내려받지 않고 설치 자리만 봄
  local miss=0 loc
  while read -r loc; do [ -d "$loc" ] || { say "브라우저 없음: $loc"; miss=1; }; done < <(cd "$E2E" && npx playwright install --dry-run chromium webkit 2>/dev/null | sed -n 's/^ *Install location: *//p' | tr -d '\r')
  [ $miss = 0 ] && say "브라우저 chromium·webkit 설치돼 있음"
  # 개수만 셈 (--list는 안 돌림, 보고서 폴더 안 덮게 --reporter=list)
  local n1 n2
  n1="$(cd "$E2E" && env -u E2E_NODES E2E_OUTPUT_DIR="$OUTW/list-art" npx playwright test --list --no-deps --reporter=list 2>&1 | grep -E '^Total' | tr -d '\r')"
  n2="$(cd "$E2E" && E2E_NODES=2 E2E_OUTPUT_DIR="$OUTW/list-art" npx playwright test --list --no-deps --reporter=list multinode/ 2>&1 | grep -E '^Total' | tr -d '\r')"
  say "서버 1대: ${n1:-셈 실패} / 서버 2대 전용(multinode/): ${n2:-셈 실패}"
  say "지금 $(cpu_mem | awk '{print "CPU " $1 "% 남은 메모리 " $2 "GB"}')"
  if [ -n "$busy" ] || [ "${free:-0}" -lt "${BR_MIN_DISK_GB:-20}" ] || [ "$db" != "running paused=false" ] || [ $miss = 1 ]; then
    say "멈춤: 0단계 확인 걸림 (위 줄 참고)"; return 1
  fi
  [ "$rd" != "running paused=false" ] && say "알림: 시험 Redis가 안 떠 있음 → 1대 단계는 돌고, mn·mnserial 전에 사용자에게 물을 것"
  return 0
}

step_sample() {
  say "== 1 견본: 암살 영상 A05-E-592(PC)·A05-E-625(모바일·사파리) =="
  run_pw sample 1 3 --project=desktop --project=mobile --project=mobile-safari --grep "A05-E-592|A05-E-625" || return 1
  if grep -q "바깥 막기: 크로미움 주소 규칙을 확인 못 함" "$OUT/sample.log"; then
    say "알림: 바깥 막기 주소 규칙이 안 먹음 → 모든 창에 가로채기로 막는 중 (여전히 막힘, 창 캐시만 꺼짐). 결과에 적어 둠"
  else
    say "바깥 막기 경고 없음"
  fi
  local t p f
  read -r t p f _ < "$OUT/sample.counts"
  if [ "${t:-0}" -lt 3 ] || [ "${f:-1}" -gt 0 ]; then say "멈춤: 견본 3개 중 통과 ${p:-0} → 영상·화면 빌드·서버 환경부터 볼 것 (sample.log, sample-art)"; return 1; fi
}

step_smoke() {
  say "== 2 @smoke (파일마다 하나) =="
  run_pw smoke 1 "$(next_workers)" "${PAR[@]}" --grep @smoke || return 1
  local pct; pct="$(fail_pct smoke)"
  if [ "$pct" -gt "${BR_SMOKE_MAX_FAIL:-20}" ]; then say "멈춤: @smoke 실패 ${pct}% > ${BR_SMOKE_MAX_FAIL:-20}% → 공용 도우미·환경부터 (전체 안 돌림)"; return 1; fi
}

step_rest() {
  say "== 3 나머지 전부 (서버 1대, @smoke 뺀 것) =="
  run_pw rest 1 "$(next_workers)" "${PAR[@]}" --grep-invert @smoke || return 1
  local pct; pct="$(fail_pct rest)"
  if [ "$pct" -gt "${BR_REST_MAX_FAIL:-30}" ]; then say "멈춤: 실패 ${pct}% > ${BR_REST_MAX_FAIL:-30}% → 서버가 죽었는지부터 (serial 안 돌림)"; return 1; fi
}

step_serial() {
  say "== 3b 서버 전체에 걸리는 것 (serial·admin-phone-serial, 한 번에 하나) =="
  run_pw serial 1 1 --project=serial --project=admin-phone-serial
}

step_mn() {
  say "== 4 서버 2대 전용 (multinode/, 병렬) =="
  local w; w="$(next_workers)"; [ "$w" -gt 4 ] && w=4
  run_pw mn 2 "$w" "${PAR[@]}" multinode/
}

step_mnserial() {
  say "== 4b 서버 2대 serial (Node 끄기·Redis 멈춤 docker pause/unpause mmc-redis-test, 한 번에 하나) =="
  run_pw mnserial 2 1 --project=serial multinode/ || return 1
  local rd; rd="$(docker_state mmc-redis-test)"
  [ "$rd" != "running paused=false" ] && say "알림: 시험 Redis 상태 '$rd' → 멈춘 채 남았으면 사용자에게 알리고 docker unpause mmc-redis-test"
  return 0
}

# 실패만 한 번 더 (흔들림 가리기 — "버그 리스트만 다시"), 작업자 3·CPU 80% 밑에서
step_rerun() {
  say "== 실패만 한 번 더 =="
  wait_cpu 80 900
  local grp src nodes w
  for grp in par serial mn mnserial; do
    case $grp in
      par) src="sample smoke rest"; nodes=1; w=3 ;;
      serial) src="serial"; nodes=1; w=1 ;;
      mn) src="mn"; nodes=2; w=3 ;;
      mnserial) src="mnserial"; nodes=2; w=1 ;;
    esac
    : > "$OUT/rerun-$grp.list.txt"
    for s in $src; do [ -s "$OUT/$s.list" ] && cat "$OUT/$s.list" >> "$OUT/rerun-$grp.list.txt"; done
    if [ ! -s "$OUT/rerun-$grp.list.txt" ]; then say "[rerun-$grp] 다시 돌릴 것 없음"; continue; fi
    say "[rerun-$grp] $(wc -l < "$OUT/rerun-$grp.list.txt")개"
    run_pw "rerun-$grp" "$nodes" "$w" --test-list "$OUTW/rerun-$grp.list.txt"
  done
  node "$HERE/summary.js" --merge "$OUTW" | tee -a "$OUT/timeline.txt"
}

# 끝난 뒤 확인 (읽기만, 끄기·지우기는 안 함 — 남은 것은 적어서 알림)
step_after() {
  say "== 끝 정리 확인 =="
  local busy; busy="$(ports_busy)"
  say "남은 시험 포트: ${busy:-없음}"
  local procs
  procs="$(powershell -NoProfile -Command 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "e2e.scripts.(start-backend|serve-front|lb-proxy)|shutdown-trigger" } | ForEach-Object { $_.ProcessId }' 2>/dev/null | tr -d '\r' | tr '\n' ' ')"
  say "남은 시험 서버 프로세스(PID): ${procs:-없음}"
  say "시험 Redis: $(docker_state mmc-redis-test)"
  local warn; warn="$(grep -h "지우기 실패" "$OUT"/*.log 2>/dev/null | sort | uniq -c | head -5)"
  say "계정 지우기 실패 경고: ${warn:-없음} (남은 것은 다음 실행 시작 정리가 6시간 뒤 지움)"
  say "결과 폴더 크기: $(du -sh "$OUT" 2>/dev/null | cut -f1) / 디스크 남은 $(disk_free_gb)GB / 서버 로그 $(du -sh "$E2E/.runtime" 2>/dev/null | cut -f1)"
  node "$HERE/summary.js" --merge "$OUTW" | tee -a "$OUT/timeline.txt"
}

run_steps() {
  local s
  for s in "$@"; do
    case $s in
      check) step_check ;; sample) step_sample ;; smoke) step_smoke ;; rest) step_rest ;; serial) step_serial ;;
      mn) step_mn ;; mnserial) step_mnserial ;; after) step_after ;; rerun) step_rerun ;;
      *) say "모르는 단계: $s"; return 2 ;;
    esac || { say "여기서 멈춤 ($s). 고친 뒤 남은 단계만: bash tools/시험도구/br/once.sh <남은 단계…> (BR_OUT 같게)"; step_after; return 1; }
  done
}

[ $# -eq 0 ] && { echo "쓰기: bash tools/시험도구/br/once.sh all | check sample smoke rest serial mn mnserial after | rerun"; exit 2; }
say "===== once.sh $* (결과 폴더 $OUTW) ====="
if [ "$1" = all ]; then run_steps check sample smoke rest serial mn mnserial after; else run_steps "$@"; fi
