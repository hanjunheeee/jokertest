#!/usr/bin/env bash
# CI 데스크톱 화면 시험 파일, npm ci → eslint → npm test → 빌드 (API 주소는 시험 값)
# 빌드 결과(frontend/dist)는 확인만, 배포 이미지는 frontend/Dockerfile이 따로 빌드
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

npm_ci frontend
npm_run frontend lint
npm_run frontend test
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://api.ci.test}"
# CI_BUILD_OUT_DIR가 있으면 그 폴더로 (로컬에서 돌릴 때 원래 dist 안 덮기)
if [ -n "${CI_BUILD_OUT_DIR:-}" ]; then
    npm_run frontend build -- --outDir "$CI_BUILD_OUT_DIR/frontend" --emptyOutDir
else
    npm_run frontend build
fi
