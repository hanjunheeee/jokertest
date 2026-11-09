#!/usr/bin/env bash
# CI 브라우저 시험 파일, 시험 DB(MySQL 서비스) + e2e 서버 셋(백엔드 4100·빌드본 화면 5273·5274)을 Playwright가 띄워 돌림
# 쓰는 법: e2e.sh quick (PR용 빠른 묶음) | e2e.sh full (전부, 하루 한 번·손으로) | e2e.sh multinode (Node 2개로 전부, 밤마다)
#   quick = desktop 프로젝트만, 로그인·로비·방·보안 폴더, 판 시험(@game)·서버 전체 시험(@serial·@shutdown) 뺌
#   full  = desktop·mobile·mobile-safari·serial 전부 (WebKit 필요)
#   multinode = full과 같은 묶음을 Node 2개로: E2E_NODES=2·E2E_LB=rr(일부러 번갈아)·E2E_PROXY=nginx(docker, 운영과 같은 규칙)
#     + tests/multinode, @single-node 뺌. Redis는 E2E_REDIS_URL(CI 서비스 컨테이너), 결과는 e2e/.runtime/backend-e2e-n*.log도
# 받는 값: MYSQL_ROOT_PASSWORD·CI_DB_*(lib/db.sh), E2E_WORKERS(기본 2 — CI 러너 2코어), E2E_INSTALL_BROWSERS(기본 1, 브라우저 든 이미지면 0)
# 결과: e2e/reports/html·results.json, 실패 사진·trace는 e2e/test-results/ci
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
source "$ROOT/deploy/ci/scripts/lib/db.sh"

mode="${1:-quick}"
case "$mode" in quick|full|multinode) ;; *) echo "쓰는 법: e2e.sh quick|full|multinode" >&2; exit 2 ;; esac

npm_ci backend
npm_ci frontend
npm_ci frontend-mobile
npm_ci e2e

if [ "${E2E_INSTALL_BROWSERS:-1}" = "1" ]; then
    browsers="chromium"
    [ "$mode" != "quick" ] && browsers="chromium webkit"
    step "Playwright 브라우저 받기: $browsers"
    # --with-deps는 리눅스 러너에서 apt로 브라우저 의존 패키지까지 (sudo 필요)
    (cd "$ROOT/e2e" && npx playwright install --with-deps $browsers)
fi

ci_db_prepare

export CI=1
export E2E_WORKERS="${E2E_WORKERS:-2}"
export E2E_OUTPUT_DIR="${E2E_OUTPUT_DIR:-test-results/ci}"
if [ "$mode" = "multinode" ]; then
    export E2E_NODES="${E2E_NODES:-2}" E2E_LB="${E2E_LB:-rr}" E2E_PROXY="${E2E_PROXY:-nginx}"
    : "${E2E_REDIS_URL:?multinode엔 E2E_REDIS_URL 필요 (CI Redis 서비스, 예: redis://127.0.0.1:6379)}"
    export E2E_REDIS_URL
fi

step "브라우저 시험 ($mode, 작업자 $E2E_WORKERS)"
cd "$ROOT/e2e"
if [ "$mode" = "quick" ]; then
    npx playwright test --project=desktop --grep-invert "@game|@serial|@shutdown" tests/auth tests/lobby tests/room tests/security
else
    npx playwright test
fi
