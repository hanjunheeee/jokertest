#!/usr/bin/env bash
# Node 여러 개 nginx 설정 확인 파일, gen-nodes.js로 Node N개 upstream을 만들어 진짜 default.conf와 같이 docker nginx에서 nginx -t (MN-136)
# 쓰는 법(저장소 루트): bash deploy/scripts/nginx-nodes-check.sh [Node 수, 기본 3] — CI docker-build.sh도 부름, 저장소 파일은 안 바꿈
# backend-nX 컨테이너가 없어도 통과해야 함 (upstream server의 resolve: 꺼진 Node가 있어도 nginx가 켜짐)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
COUNT="${1:-3}"
IMAGE="${CHECK_NGINX_IMAGE:-nginx:1.27-alpine}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export MSYS_NO_PATHCONV=1
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

cp -r "$ROOT/nginx/snippets" "$WORK/snippets"
node "$(hostpath "$ROOT/deploy/scripts/gen-nodes.js")" --count "$COUNT" --upstreams "$(hostpath "$WORK/snippets/mmc-upstreams.conf")" --compose "$(hostpath "$WORK/nodes.yml")"

docker run --rm \
    -v "$(hostpath "$ROOT/nginx/default.conf"):/etc/nginx/conf.d/default.conf:ro" \
    -v "$(hostpath "$WORK/snippets"):/etc/nginx/snippets:ro" \
    "$IMAGE" nginx -t
echo "[nginx-nodes-check] Node ${COUNT}개 upstream nginx -t 통과"
