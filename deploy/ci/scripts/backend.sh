#!/usr/bin/env bash
# CI 백엔드 시험 파일, npm ci → eslint → npm test(DB 없는 기본) → 게임 핵심 시험
# GitHub Actions ci.yml·GitLab gitlab-ci.yml의 backend 일이 부름, 로컬: CI_SKIP_INSTALL=1 bash deploy/ci/scripts/backend.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

npm_ci backend
npm_run backend lint
npm_run backend test
npm_run backend test:game-core
