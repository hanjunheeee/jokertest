#!/usr/bin/env bash
# CI 모바일 화면 시험 파일, 데스크톱 폴더 의존(src·public 같이 읽음)이라 두 폴더 다 npm ci → eslint → npm test → 빌드
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

npm_ci frontend
npm_ci frontend-mobile
npm_run frontend-mobile lint
npm_run frontend-mobile test
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://api.ci.test}"
# CI_BUILD_OUT_DIR가 있으면 그 폴더로 (로컬에서 돌릴 때 원래 dist 안 덮기)
if [ -n "${CI_BUILD_OUT_DIR:-}" ]; then
    npm_run frontend-mobile build -- --outDir "$CI_BUILD_OUT_DIR/frontend-mobile" --emptyOutDir
else
    npm_run frontend-mobile build
fi
