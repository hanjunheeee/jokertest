#!/usr/bin/env bash
# 본보기 사본임: <임시 폴더>·<저장소>를 내 컴퓨터 경로로 바꿔 써야 함
# 브라우저 점검: 한 묶음 돌리고 실패 파일만 한 번 다시
# 사용: bash run-phase.sh <이름> <nodes> <playwright 인자...>
name="$1"; nodes="$2"; shift 2
OUT="<임시 폴더>/br"
cd <저장소>/e2e || exit 1
cpu() { powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average)" 2>/dev/null | tr -d '\r'; }
c1=$(cpu); sleep 3; c2=$(cpu); sleep 3; c3=$(cpu); avg=$(( (c1+c2+c3)/3 ))
if [ $avg -ge 90 ]; then w=3; elif [ $avg -ge 60 ]; then w=4; else w=5; fi
[ -n "$FORCE_WORKERS" ] && w=$FORCE_WORKERS
echo "[$name] $(date +%H:%M:%S) 시작 CPU=$avg workers=$w nodes=$nodes" | tee -a "$OUT/timeline.txt"
# CPU 감시 (30초마다)
( while true; do echo "$(date +%H:%M:%S) $(cpu)" >> "$OUT/cpu-$name.txt"; sleep 30; done ) &
mon=$!
export E2E_NODES=$nodes E2E_WORKERS=$w
[ -f "$OUT/.built" ] && export E2E_FRONT_REBUILD=0
export E2E_RUN_ID="br${name}$(date +%H%M)"
start=$(date +%s)
PLAYWRIGHT_JSON_OUTPUT_FILE="$OUT/$name.json" npx playwright test --retries=0 --workers=$w --reporter=line,json "$@" > "$OUT/$name.log" 2>&1
rc=$?
touch "$OUT/.built"
end=$(date +%s)
echo "[$name] $(date +%H:%M:%S) 끝 rc=$rc 걸린 $(( (end-start)/60 ))분 run=$E2E_RUN_ID" | tee -a "$OUT/timeline.txt"
# 실패 파일 다시 (project별)
node "$OUT/failed.js" "$OUT/$name.json" > "$OUT/$name.failed.txt"
if [ -s "$OUT/$name.failed.txt" ]; then
  export E2E_RUN_ID="br${name}R$(date +%H%M)"
  args=()
  while read -r proj file; do args+=("--project=$proj" "$file"); done < "$OUT/$name.failed.txt"
  projs=$(cut -d' ' -f1 "$OUT/$name.failed.txt" | sort -u | sed 's/^/--project=/' | tr '\n' ' ')
  files=$(cut -d' ' -f2 "$OUT/$name.failed.txt" | sort -u | tr '\n' ' ')
  s2=$(date +%s)
  PLAYWRIGHT_JSON_OUTPUT_FILE="$OUT/$name-rerun.json" npx playwright test --retries=0 --workers=$w --no-deps --reporter=line,json $projs $files > "$OUT/$name-rerun.log" 2>&1
  echo "[$name] $(date +%H:%M:%S) 다시 끝 rc=$? 걸린 $(( ($(date +%s)-s2)/60 ))분 run=$E2E_RUN_ID" | tee -a "$OUT/timeline.txt"
fi
kill $mon 2>/dev/null
