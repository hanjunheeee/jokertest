#!/usr/bin/env bash
# CI 도커 이미지 빌드 확인 파일, docker compose build(올리지 않음) → 화면 이미지 안 nginx 설정 검사(nginx -t)
# 프로젝트 이름을 따로(mmc-ci) 써서 로컬에서 돌려도 개발용 jokertest-* 이미지·컨테이너는 안 건드림
# HTTPS 조각(nginx/tls)은 인증서가 있어야 해서 빼고 기본 설정만 검사
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mmc-ci}"
cd "$ROOT"

step "docker compose build (push 안 함)"
docker compose build

step "nginx -t (화면 이미지 안 설정, backend 이름은 127.0.0.1로)"
docker run --rm --add-host backend:127.0.0.1 "${COMPOSE_PROJECT_NAME}-frontend" nginx -t

step "클라우드플레어 뒤 진짜 사용자 IP 확인 (nginx 설정 + 가짜 백엔드, 위조 무시·/internal·로그인 제한·소켓·폰 302 캐시)"
CHECK_NODE_IMAGE="${COMPOSE_PROJECT_NAME}-backend" bash "$ROOT/deploy/scripts/cloudflare-ip-check/run.sh"
