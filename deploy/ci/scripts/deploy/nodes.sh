#!/usr/bin/env bash
# 서버 안 Node 여러 개 함수 파일, Node 수·생성 파일 만들기·Node 하나씩 바꾸기(드레인 → 판·방 0개 → 새 이미지 → /health)
# remote.sh가 compose·log·running을 만든 뒤 source로 읽음 (혼자 안 돎), 쓰는 법: docs/배포_설정.md 7장

# Node 수: 셸 NODE_COUNT → .env.production NODE_COUNT → 코어 수 (deploy/scripts/gen-nodes.js와 같은 규칙, 1~64)
node_count() {
    local n="${NODE_COUNT:-$(sed -n 's/^NODE_COUNT=//p' .env.production | tail -n 1 | tr -d '"[:space:]')}"
    if [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le 64 ]; then echo "$n"; else nproc; fi
}
# Node 이름 → compose 서비스 (n1은 base의 backend)
service_of() { if [ "$1" = "n1" ]; then echo backend; else echo "backend-$1"; fi; }
node_ids() { seq -f 'n%g' 1 "$(node_count)"; }

# 롤링 여부: DEPLOY_ROLLING=1/0, auto(기본)면 Node 2개 이상일 때
rolling() {
    case "${DEPLOY_ROLLING:-auto}" in 1) return 0 ;; 0) return 1 ;; *) [ "$(node_count)" -ge 2 ] ;; esac
}

# nginx upstream 조각·docker-compose.nodes.yml 다시 만들기 (서버에 node가 없으면 새 백엔드 이미지 안 node로)
gen_nodes() {
    local args=(deploy/scripts/gen-nodes.js --count "$(node_count)" --registry)
    if command -v node >/dev/null 2>&1; then
        node "${args[@]}"
    else
        docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work --entrypoint node "$IMAGE_REGISTRY/mmc-backend:$IMAGE_TAG" "${args[@]}"
    fi
}

# 컨테이너 안에서 명령: 대상은 compose 서비스 이름, 또는 cid:<컨테이너 id> (compose 목록에서 빠진 Node)
in_node() {
    local target="$1"; shift
    case "$target" in
        cid:*) docker exec -i "${target#cid:}" "$@" ;;
        *) compose exec -T "$target" "$@" ;;
    esac
}

# 관리자 통로 부르기 (열쇠는 컨테이너 환경값, 안 찍음) → field 값 한 줄 또는 실패
internal_call_on() {
    local target="$1" method="$2" path="$3" field="${4:-}"
    in_node "$target" env CALL_METHOD="$method" CALL_PATH="$path" CALL_FIELD="$field" node -e '
fetch("http://127.0.0.1:4000" + process.env.CALL_PATH, { method: process.env.CALL_METHOD, headers: { "X-Internal-Key": process.env.INTERNAL_API_KEY || "" } })
  .then(async (r) => { if (!r.ok) { console.error("status " + r.status); process.exit(1); } const j = await r.json(); if (process.env.CALL_FIELD) console.log(j[process.env.CALL_FIELD]); })
  .catch((e) => { console.error(e.message); process.exit(1); });'
}

# 켜진 백엔드 서비스 목록 (backend, backend-n2 …)
running_backends() { compose ps --services --status running 2>/dev/null | grep -E '^backend(-n[0-9]+)?$' || true; }

# 서비스 하나가 /health 200 + redis down 아님이 될 때까지 (최대 3분)
wait_healthy() {
    local svc="${1:-backend}"
    for _ in $(seq 1 36); do
        if compose exec -T "$svc" node -e 'fetch("http://127.0.0.1:4000/health").then(async r=>{const j=await r.json().catch(()=>({}));process.exit(r.ok&&j.redis!=="down"?0:1)}).catch(()=>process.exit(1))' 2>/dev/null; then
            log "$svc /health 200"; return 0
        fi
        sleep 5
    done
    log "$svc가 3분 안에 안 켜짐 → docker compose logs $svc"; compose logs --tail 80 "$svc" || true
    return 1
}

# nginx가 새 upstream 조각을 읽게 (조각 폴더가 붙어 있음, 꺼져 있으면 건너뜀)
reload_nginx() {
    running frontend || return 0
    compose exec -T frontend nginx -t >/dev/null 2>&1 && compose exec -T frontend nginx -s reload && log "nginx upstream 다시 읽음"
}

# 그 Node 판+방 수 (/internal/cluster, 못 읽으면 ?)
node_load() {
    local target="$1" id="$2"
    in_node "$target" env NODE_ID="$id" node -e '
fetch("http://127.0.0.1:4000/internal/cluster",{headers:{"X-Internal-Key":process.env.INTERNAL_API_KEY||""}}).then(r=>r.json()).then(j=>{
const n=(Array.isArray(j)?j:(j.nodes||[])).find(x=>x.id===process.env.NODE_ID);console.log(n?(Number(n.games)||0)+(Number(n.rooms)||0):"?")}).catch(()=>console.log("?"))' 2>/dev/null || echo "?"
}

# 드레인 → 그 Node 판·방 0개까지, DRAIN_MAX_MINUTES(기본 40) 넘으면 DRAIN_FORCE=1일 때만 진행
drain_node() {
    local id="$1" target="$2" until left
    internal_call_on "$target" POST "/internal/nodes/$id/drain" >/dev/null || { log "$id 드레인 통로 없음(옛 버전?) → 이번 배포는 DEPLOY_ROLLING=0으로"; return 1; }
    until=$(( $(date +%s) + ${DRAIN_MAX_MINUTES:-40} * 60 ))
    while :; do
        left="$(node_load "$target" "$id")"
        [ "$left" = "0" ] && { log "$id 판·방 0개"; return 0; }
        if [ "$(date +%s)" -ge "$until" ]; then
            [ "${DRAIN_FORCE:-0}" = "1" ] && { log "$id 판·방 $left 남음, DRAIN_FORCE=1 → 진행"; return 0; }
            log "$id 판·방이 ${DRAIN_MAX_MINUTES:-40}분 안에 안 끝남 ($left) → 멈춤 (그 Node만 점검 안내 뒤 DRAIN_FORCE=1)"; return 1
        fi
        log "$id 남은 판·방 $left → 15초 뒤 다시"; sleep 15
    done
}

# Node 수를 줄였을 때: 목록에서 빠진 backend-nX 컨테이너를 드레인 → 끔 (SIGTERM → 그 Node 사람만 server_shutdown)
stop_removed_nodes() {
    local project cid svc id
    project="$(compose config --format json 2>/dev/null | sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' | head -n 1)"
    for cid in $(docker ps -q --filter "label=com.docker.compose.project=$project"); do
        svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$cid")"
        [[ "$svc" =~ ^backend-n[0-9]+$ ]] || continue
        id="${svc#backend-}"
        node_ids | grep -qx "$id" && continue
        log "줄어든 Node $id 끄기"
        drain_node "$id" "cid:$cid" || return 1
        docker stop -t 15 "$cid" >/dev/null && docker rm "$cid" >/dev/null
    done
}

# Node 하나씩 바꾸기: 드레인 → 새 이미지로 다시 만들기 → /health (새 부팅은 드레인 꺼진 채 켜짐) → 줄어든 Node 끔 → nginx
roll_to() {
    export IMAGE_TAG="$1"
    gen_nodes
    compose up -d --no-build db redis
    local id svc
    for id in $(node_ids); do
        svc="$(service_of "$id")"
        if running "$svc"; then drain_node "$id" "$svc" || return 1; fi
        log "$id 바꾸기 ($svc → $IMAGE_TAG)"
        compose up -d --no-build --no-deps "$svc"
        wait_healthy "$svc" || return 1
    done
    stop_removed_nodes || return 1
    compose up -d --no-build --no-deps frontend
    reload_nginx
}

# 한 번에 다 바꾸기 (예전 방식: 점검·판 0개 기다리기는 deploy가 먼저 함)
switch_to() {
    export IMAGE_TAG="$1"
    gen_nodes
    compose up -d --no-build --remove-orphans
    local id
    for id in $(node_ids); do wait_healthy "$(service_of "$id")" || return 1; done
    reload_nginx
}
