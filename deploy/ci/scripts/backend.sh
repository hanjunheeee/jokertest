#!/usr/bin/env bash
# CI 백엔드 시험 파일, npm ci → eslint → npm test(DB 없는 기본) → 게임 핵심 시험
# GitHub Actions ci.yml·GitLab gitlab-ci.yml의 backend 일이 부름, 로컬: CI_SKIP_INSTALL=1 bash deploy/ci/scripts/backend.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

npm_ci backend
# 백엔드 시험 하나(tests/routes/topup.security.test.js)가 화면 빌드 결과에 서버 비밀값이 안 섞이는지 보려고 frontend를 빌드함
npm_ci frontend
npm_run backend lint
npm_run backend test
npm_run backend test:game-core
