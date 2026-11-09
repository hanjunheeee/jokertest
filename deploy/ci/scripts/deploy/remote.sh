#!/usr/bin/env bash
# 서버 안 배포 파일, ship.sh가 SSH로 DEPLOY_PATH에서 부름 (손으로도: cd <DEPLOY_PATH> && bash deploy/ci/scripts/deploy/remote.sh status)
# 쓰는 법: remote.sh deploy <태그> | remote.sh rollback [태그] | remote.sh status
# 배포 순서(docs/배포_설정.md·docs/마이그레이션_복구.md): 이미지 pull → 점검 켜기 → 판 0개까지 기다리기 → DB 백업 → migrate 상태·적용
#   → up -d → /health·관리자 통로 점검 → 점검 끄기 → 태그 기록 (실패하면 멈추고 러너가 rollback 부름)
# 받는 값: IMAGE_REGISTRY, DEPLOY_MAINTENANCE(1/0), DRAIN_MAX_MINUTES, DRAIN_FORCE(1이면 시간 넘어도 진행), RUN_MIGRATIONS(1/0), SERVER_ROLE
# 비밀값은 서버 .env.production에서만 (이 스크립트는 값 안 찍음)
set -euo pipefail

action="${1:?쓰는 법: remote.sh deploy <태그> | rollback [태그] | status}"
arg_tag="${2:-}"
STATE_DIR=".deploy"
BACKUP_DIR="backups"
mkdir -p "$STATE_DIR" "$BACKUP_DIR"

[ -f .env.production ] || { echo "[remote] .env.production 없음 ($(pwd)) → docs/배포_설정.md 4장" >&2; exit 1; }
: "${IMAGE_REGISTRY:?IMAGE_REGISTRY 필요}"
export IMAGE_REGISTRY

log() { printf '[remote %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
current_tag() { cat "$STATE_DIR/current_tag" 2>/dev/null || true; }
previous_tag() { cat "$STATE_DIR/previous_tag" 2>/dev/null || true; }

# compose: 기본 + 운영(80·443·HTTPS) + 레지스트리 이미지 이름, 값은 .env.production (IMAGE_TAG는 셸 값이 이김)
compose() {
    docker compose -f docker-compose.yml -f docker-compose.prod.yml -f deploy/ci/compose.registry.yml --env-file .env.production "$@"
}

running() { [ -n "$(compose ps -q --status running "$1" 2>/dev/null)" ]; }

# 운영 DB에 root로 SQL (db 컨테이너 안 환경값 비번)
db_sql() {
    compose exec -T db sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' 2> >(grep -v "Using a password" >&2)
}

# 백엔드 컨테이너 안에서 관리자 통로 부르기 (열쇠는 컨테이너 환경값, 안 찍음)
internal_call() {
    local method="$1" path="$2" field="${3:-}"
    compose exec -T -e CALL_METHOD="$method" -e CALL_PATH="$path" -e CALL_FIELD="$field" backend node -e '
fetch("http://127.0.0.1:4000" + process.env.CALL_PATH, { method: process.env.CALL_METHOD, headers: { "X-Internal-Key": process.env.INTERNAL_API_KEY || "" } })
  .then(async (r) => { if (!r.ok) { console.error("status " + r.status); process.exit(1); } const j = await r.json(); if (process.env.CALL_FIELD) console.log(j[process.env.CALL_FIELD]); })
  .catch((e) => { console.error(e.message); process.exit(1); });'
}

# 점검 켜기/끄기: DB 한 줄 바꾸고 서버에 다시 읽게 (새 방·시작·코드 입장 막음, 진행 중 판은 그대로)
set_maintenance() {
    local on="$1"
    if ! running db; then log "db 안 켜짐 → 점검 $on 건너뜀"; return 0; fi
    if [ "$on" = "1" ]; then
        printf "UPDATE maintenance_state SET is_enabled=1, message='서버 업데이트 중입니다. 잠시 뒤 다시 시도해주세요.', updated_at=UTC_TIMESTAMP() WHERE id=1;\n" | db_sql
    else
        printf "UPDATE maintenance_state SET is_enabled=0, message=NULL, updated_at=UTC_TIMESTAMP() WHERE id=1;\n" | db_sql
    fi
    if running backend; then internal_call POST /internal/maintenance/reload >/dev/null || log "점검 다시 읽기 실패 (INTERNAL_API_KEY 확인)"; fi
    log "점검 $([ "$on" = 1 ] && echo 켬 || echo 끔)"
}

# 진행 중 판이 0개 될 때까지 (판은 메모리에 있어 백엔드 재시작 때 사라짐)
wait_no_games() {
    running backend || { log "백엔드 안 켜짐 → 기다리기 건너뜀"; return 0; }
    local until=$(( $(date +%s) + ${DRAIN_MAX_MINUTES:-30} * 60 )) count misses=0
    while :; do
        count="$(internal_call GET /internal/live gameCount || echo "?")"
        if [ "$count" = "0" ]; then log "진행 중 판 0개"; return 0; fi
        # 판 수를 세 번 연속 못 읽으면(열쇠 없음 등) 오래 안 기다리고 멈춤
        if [ "$count" = "?" ]; then misses=$((misses + 1)); else misses=0; fi
        if [ $misses -ge 3 ]; then log "판 수를 못 읽음 (/internal/live, INTERNAL_API_KEY 확인) → 배포 멈춤"; return 1; fi
        if [ "$(date +%s)" -ge "$until" ]; then
            if [ "${DRAIN_FORCE:-0}" = "1" ]; then log "판 ${count}개 남음, DRAIN_FORCE=1 → 그대로 진행"; return 0; fi
            log "판 ${count}개가 ${DRAIN_MAX_MINUTES:-30}분 안에 안 끝남 → 배포 멈춤"; return 1
        fi
        log "진행 중 판 ${count}개 → 15초 뒤 다시"
        sleep 15
    done
}

# DB 백업 (크기 0이면 실패), 최근 20개만 남김
backup_db() {
    running db || { log "db 안 켜짐(첫 배포) → 백업 건너뜀"; return 0; }
    local file="$BACKUP_DIR/backup-$(date -u +%Y%m%d%H%M%S)-before-${IMAGE_TAG}.sql.gz"
    compose exec -T db sh -c 'mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' 2> >(grep -v "Using a password" >&2) | gzip > "$file"
    if [ "$(gzip -cd "$file" | head -c 1024 | wc -c)" -eq 0 ]; then log "백업이 비었음: $file"; return 1; fi
    echo "$file" > "$STATE_DIR/last_backup"
    log "백업: $file ($(du -h "$file" | cut -f1))"
    ls -1t "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | tail -n +21 | xargs -r rm -f
}

# migrate: 상태 → 적용 → 상태 (새 이미지로, 실패하면 docs/마이그레이션_복구.md)
migrate_db() {
    compose up -d db
    compose run --rm --no-deps backend node scripts/migrate-db.js status
    if ! compose run --rm --no-deps backend node scripts/migrate-db.js migrate; then
        log "migrate 실패 → 지금 서버는 옛 이미지로 그대로 돎. 복구: docs/마이그레이션_복구.md 2장 (백업: $(cat "$STATE_DIR/last_backup" 2>/dev/null || echo 없음))"
        echo "migrate" > "$STATE_DIR/last_failure_stage"
        return 1
    fi
    compose run --rm --no-deps backend node scripts/migrate-db.js status
}

# 백엔드가 /health 200 될 때까지 (최대 3분)
wait_healthy() {
    for _ in $(seq 1 36); do
        if compose exec -T backend node -e 'fetch("http://127.0.0.1:4000/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' 2>/dev/null; then
            log "백엔드 /health 200"; return 0
        fi
        sleep 5
    done
    log "백엔드가 3분 안에 안 켜짐 → docker compose logs backend"; compose logs --tail 80 backend || true
    return 1
}

switch_to() {
    export IMAGE_TAG="$1"
    compose up -d --no-build --remove-orphans
    wait_healthy
}

case "$action" in
    status)
        log "지금 태그: $(current_tag || true) · 이전 태그: $(previous_tag || true) · 마지막 백업: $(cat "$STATE_DIR/last_backup" 2>/dev/null || echo 없음)"
        IMAGE_TAG="$(current_tag)"; export IMAGE_TAG="${IMAGE_TAG:-none}"
        compose ps
        ;;
    deploy)
        export IMAGE_TAG="${arg_tag:?deploy엔 태그 필요}"
        rm -f "$STATE_DIR/last_failure_stage"
        log "배포 시작: $IMAGE_TAG (지금 $(current_tag || true), 역할 ${SERVER_ROLE:-primary})"
        compose pull backend frontend
        if [ "${DEPLOY_MAINTENANCE:-1}" = "1" ]; then
            set_maintenance 1
            wait_no_games || { echo "drain" > "$STATE_DIR/last_failure_stage"; set_maintenance 0; exit 1; }
        fi
        if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
            backup_db || { echo "backup" > "$STATE_DIR/last_failure_stage"; exit 1; }
            migrate_db
        fi
        old="$(current_tag)"
        if ! switch_to "$IMAGE_TAG"; then echo "health" > "$STATE_DIR/last_failure_stage"; exit 1; fi
        log "관리자 통로 점검 (npm run admin -- check)"
        compose exec -T backend npm run --silent admin -- check || { echo "admin-check" > "$STATE_DIR/last_failure_stage"; exit 1; }
        [ "${DEPLOY_MAINTENANCE:-1}" = "1" ] && set_maintenance 0
        if [ -n "$old" ] && [ "$old" != "$IMAGE_TAG" ]; then echo "$old" > "$STATE_DIR/previous_tag"; fi
        echo "$IMAGE_TAG" > "$STATE_DIR/current_tag"
        log "배포 끝: $IMAGE_TAG"
        ;;
    rollback)
        # 실패한 배포 뒤: current_tag는 아직 옛 태그(성공 때만 바꿈) → 그 태그로 되돌림. 손으로: 태그 주면 그 태그
        target="${arg_tag:-}"
        if [ -z "$target" ]; then
            if [ -f "$STATE_DIR/last_failure_stage" ]; then target="$(current_tag)"; else target="$(previous_tag)"; fi
        fi
        [ -n "$target" ] || { log "되돌릴 태그가 없음 (첫 배포?) → 손으로 확인"; exit 1; }
        log "되돌리기: $target (실패 단계: $(cat "$STATE_DIR/last_failure_stage" 2>/dev/null || echo 없음))"
        compose pull backend frontend || true
        switch_to "$target"
        set_maintenance 0
        # previous_tag는 안 바꿈 (되돌린 뒤 또 되돌려도 나쁜 태그로 안 감)
        echo "$target" > "$STATE_DIR/current_tag"
        rm -f "$STATE_DIR/last_failure_stage"
        log "되돌리기 끝: $target — DB는 그대로임. 새 마이그레이션이 데이터 모양을 바꿨으면 백업 복원도: $(cat "$STATE_DIR/last_backup" 2>/dev/null || echo 백업 없음) (docs/마이그레이션_복구.md 2-A)"
        ;;
    *)
        echo "쓰는 법: remote.sh deploy <태그> | rollback [태그] | status" >&2; exit 2 ;;
esac
