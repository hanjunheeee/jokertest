#!/usr/bin/env bash
# CI 백엔드 DB 시험 파일, MySQL 서비스에 시험 전용 DB·계정 만들기(test:db:setup) → DB 포함 시험(test:with-db)
# 받는 값: MYSQL_ROOT_PASSWORD(CI 안에서만 쓰는 시험 값)·CI_DB_HOST·CI_DB_PORT (lib/db.sh), 만든 DB 주소는 backend/.env.testdb(git 안 올라감)
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
source "$ROOT/deploy/ci/scripts/lib/db.sh"

npm_ci backend
# 백엔드 시험 하나(tests/routes/topup.security.test.js)가 화면 빌드 결과에 서버 비밀값이 안 섞이는지 보려고 frontend를 빌드함
npm_ci frontend
ci_db_prepare
npm_run backend test:db:setup
npm_run backend test:with-db
