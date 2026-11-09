# CI 시험 DB 연결 조각, 앱의 DB 준비 스크립트(backend/scripts/setup-test-db.js·e2e/scripts/setup-db.js)가 부르는
# `docker exec -i <컨테이너> sh -c 'mysql -uroot ...'`를 CI의 MySQL 서비스로 돌려줌 (앱 코드는 안 고침)
#
# 두 방식:
# - shim(기본, CI): docker-shim/docker가 그 명령만 가로채 node(mysql2)로 root SQL을 보냄 → GitHub·GitLab 어디든 같음
# - docker: CI_DB_CONTAINER=<컨테이너 이름>이면 진짜 docker exec (로컬 확인용, 윈도우는 이쪽만 됨)
#
# 받는 값: MYSQL_ROOT_PASSWORD(시험용 값), CI_DB_HOST(기본 127.0.0.1), CI_DB_PORT(기본 3306), CI_DB_CONTAINER(선택)
# 앱 스크립트가 DB 주소를 127.0.0.1로 고정해서, 서비스가 다른 이름(GitLab의 mysql)이면 127.0.0.1:포트로 이어 줌

ci_db_prepare() {
    : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD(시험 DB root 비번, CI 안에서만 쓰는 값)가 필요함}"
    export CI_DB_HOST="${CI_DB_HOST:-127.0.0.1}"
    export CI_DB_PORT="${CI_DB_PORT:-3306}"
    local lib_dir="$ROOT/deploy/ci/scripts/lib"

    # 서비스가 127.0.0.1에 없으면 이어 주기 (GitLab: 서비스 이름이 mysql)
    if [ "$CI_DB_HOST" != "127.0.0.1" ] && [ "$CI_DB_HOST" != "localhost" ]; then
        step "시험 DB 이어 주기 127.0.0.1:$CI_DB_PORT → $CI_DB_HOST:$CI_DB_PORT"
        node "$lib_dir/tcp-forward.cjs" "$CI_DB_PORT" "$CI_DB_HOST" "$CI_DB_PORT" &
        CI_DB_FORWARD_PID=$!
        export CI_DB_FORWARD_PID
        trap 'kill "$CI_DB_FORWARD_PID" 2>/dev/null || true' EXIT
        export CI_DB_HOST=127.0.0.1
    fi

    if [ -n "${CI_DB_CONTAINER:-}" ]; then
        echo "[ci] 시험 DB: 진짜 docker exec ($CI_DB_CONTAINER)"
        export TEST_DB_CONTAINER="$CI_DB_CONTAINER" E2E_DB_CONTAINER="$CI_DB_CONTAINER"
    else
        echo "[ci] 시험 DB: docker 가로채기(shim) → $CI_DB_HOST:$CI_DB_PORT"
        chmod +x "$lib_dir/docker-shim/docker" 2>/dev/null || true
        export PATH="$lib_dir/docker-shim:$PATH"
        export TEST_DB_CONTAINER=ci-mysql E2E_DB_CONTAINER=ci-mysql
    fi
    export TEST_DB_PORT="$CI_DB_PORT" E2E_DB_PORT="$CI_DB_PORT"

    step "시험 DB 켜질 때까지 기다리기"
    node "$lib_dir/mysql-root.cjs" --ping
}
