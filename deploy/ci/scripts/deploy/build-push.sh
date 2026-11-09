#!/usr/bin/env bash
# 배포 이미지 빌드·올리기 파일, backend·frontend 이미지를 커밋 해시 태그로 빌드해 레지스트리에 push
# 받는 값: IMAGE_REGISTRY(ghcr.io/<계정> 또는 <이름>.kr.ncr.ntruss.com), IMAGE_TAG(기본 커밋 해시 12자),
#          REGISTRY_USERNAME·REGISTRY_PASSWORD(레지스트리 로그인, 비번은 표준 입력으로만 넘김),
#          VITE_*(화면 빌드 때 박히는 값 — 비밀 아님, 환경마다 다름: VITE_API_BASE_URL 꼭)
# 결과: 마지막 줄에 image_tag=<태그> (워크플로가 다음 일로 넘김)
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

: "${IMAGE_REGISTRY:?IMAGE_REGISTRY 필요 (예: ghcr.io/<계정>)}"
: "${VITE_API_BASE_URL:?VITE_API_BASE_URL 필요 (환경마다 다른 API 주소, 경로 없이)}"
export IMAGE_REGISTRY="${IMAGE_REGISTRY%/}"
export IMAGE_TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short=12 HEAD)}"
registry_host="${IMAGE_REGISTRY%%/*}"

if [ -n "${REGISTRY_USERNAME:-}" ] && [ -n "${REGISTRY_PASSWORD:-}" ]; then
    step "레지스트리 로그인: $registry_host"
    printf '%s' "$REGISTRY_PASSWORD" | docker login "$registry_host" -u "$REGISTRY_USERNAME" --password-stdin
fi

cd "$ROOT"
compose=(docker compose -f docker-compose.yml -f deploy/ci/compose.registry.yml)

step "이미지 빌드: $IMAGE_REGISTRY/mmc-{backend,frontend}:$IMAGE_TAG"
"${compose[@]}" build backend frontend

step "이미지 올리기"
"${compose[@]}" push backend frontend

echo "image_tag=$IMAGE_TAG"
