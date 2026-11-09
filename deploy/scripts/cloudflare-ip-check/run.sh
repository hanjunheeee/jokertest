#!/usr/bin/env bash
# 클라우드플레어 뒤 진짜 사용자 IP 확인 파일: 진짜 nginx 설정 + 가짜 백엔드를 잠깐 docker 망에 켜고 검사
# 확인하는 것: nginx $remote_addr(로그) · Express req.ip · 소켓 접속 IP · /internal 허용 · 로그인 제한 · 폰 302 캐시 머리말
#   direct     = 클라우드플레어 아닌 IP가 CF-Connecting-IP 위조 → 무시돼야 함 (저장소 조각 그대로)
#   cloudflare = 클라우드플레어 서버에서 온 것 흉내 (이 시험 망 범위를 믿을 범위에 한 줄 더한 조각)
# 쓰는 법(저장소 루트): bash deploy/scripts/cloudflare-ip-check/run.sh
#   node 이미지는 express·socket.io·ws·morgan이 /app/node_modules에 있는 백엔드 이미지 (기본 jokertest-backend:latest)
# 진짜 서버·DB 컨테이너는 안 건드림, 만든 망·컨테이너는 끝나면 지움
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
NODE_IMAGE="${CHECK_NODE_IMAGE:-jokertest-backend:latest}"
NGINX_IMAGE="${CHECK_NGINX_IMAGE:-nginx:1.27-alpine}"
NAME="mmc-cfcheck-$$"
WORK="$(mktemp -d)"
# 윈도우 Git Bash: docker에 넘기는 컨테이너 안 경로를 바꾸지 않게
export MSYS_NO_PATHCONV=1

# docker에 넘길 내 PC 경로 (윈도우면 C:\ 모양)
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

cleanup() {
    docker rm -f "$NAME-nginx" "$NAME-backend" >/dev/null 2>&1 || true
    docker network rm "$NAME" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

docker network create "$NAME" >/dev/null
SUBNET="$(docker network inspect -f '{{(index .IPAM.Config 0).Subnet}}' "$NAME")"
echo "[준비] 시험 망 $NAME ($SUBNET)"

# 데스크톱 화면 자리 (PC 200 확인용 빈 index.html)
mkdir -p "$WORK/html"
echo '<!doctype html><title>cfcheck</title>' > "$WORK/html/index.html"

# 조각 두 벌: 둘 다 /internal 허용 목록에 203.0.113.7 하나만
cp -r "$ROOT/nginx/snippets" "$WORK/snip-direct"
printf 'allow 203.0.113.7;\ndeny all;\n' > "$WORK/snip-direct/internal-allow.conf"
cp -r "$WORK/snip-direct" "$WORK/snip-cloudflare"
printf '\n# 시험 전용: 이 망을 클라우드플레어 서버로 침\nset_real_ip_from %s;\n' "$SUBNET" >> "$WORK/snip-cloudflare/cloudflare-realip.conf"

# 가짜 백엔드 (nginx가 부르는 backend:4000 이름), IP 읽기는 저장소 utils/request.js 그대로
docker run -d --name "$NAME-backend" --network "$NAME" --network-alias backend \
    --entrypoint node -e NODE_PATH=/app/node_modules \
    -v "$(hostpath "$ROOT/backend/utils/request.js"):/app/utils/request.js:ro" \
    -v "$(hostpath "$HERE"):/check:ro" \
    "$NODE_IMAGE" /check/stub-backend.js >/dev/null
for _ in $(seq 1 30); do docker logs "$NAME-backend" 2>&1 | grep -q "4000 켜짐" && break; sleep 1; done

fail=0
run_variant() {
    local mode="$1" snippets="$2"
    echo
    echo "=== $mode ==="
    docker run -d --name "$NAME-nginx" --network "$NAME" \
        --network-alias api.example.com --network-alias example.com \
        -v "$(hostpath "$ROOT/nginx/default.conf"):/etc/nginx/conf.d/default.conf:ro" \
        -v "$(hostpath "$snippets"):/etc/nginx/snippets:ro" \
        -v "$(hostpath "$WORK/html"):/usr/share/nginx/html/desktop:ro" \
        "$NGINX_IMAGE" >/dev/null
    docker exec "$NAME-nginx" nginx -t 2>&1 | tail -n 1
    sleep 1

    docker run --rm --network "$NAME" --entrypoint node -e NODE_PATH=/app/node_modules \
        -v "$(hostpath "$HERE"):/check:ro" "$NODE_IMAGE" /check/client.js "$mode" || fail=1

    # nginx 접속 로그 맨 앞($remote_addr)도 진짜 IP인지
    local log; log="$(docker logs "$NAME-nginx" 2>/dev/null | grep -E '"(GET|POST) /(whoami|internal|socket.io)' || true)"
    echo "[nginx 로그 몇 줄]"; printf '%s\n' "$log" | head -n 3
    if [ "$mode" = cloudflare ]; then
        printf '%s\n' "$log" | grep -q '^203\.0\.113\.7 ' && echo "OK   [$mode] nginx 로그에 진짜 IP" || { echo "실패 [$mode] nginx 로그에 진짜 IP 없음"; fail=1; }
    else
        printf '%s\n' "$log" | grep -q '^203\.0\.113\.7 ' && { echo "실패 [$mode] 위조 IP가 nginx 로그에 찍힘"; fail=1; } || echo "OK   [$mode] nginx 로그에 위조 IP 없음"
    fi
    docker rm -f "$NAME-nginx" >/dev/null
}

run_variant direct "$WORK/snip-direct"
# 앞 변형이 남긴 백엔드 로그 줄 수 (뒤 변형 줄만 보기)
before="$(docker logs "$NAME-backend" 2>&1 | wc -l)"
run_variant cloudflare "$WORK/snip-cloudflare"

# 백엔드 요청 로그·소켓 로그 맨 앞도 진짜 IP인지 (cloudflare 변형)
echo
echo "[백엔드 로그 몇 줄]"
blog="$(docker logs "$NAME-backend" 2>&1 | tail -n +"$((before + 1))")"
printf '%s\n' "$blog" | grep -E 'whoami|socket' | head -n 3
printf '%s\n' "$blog" | grep -q '^203\.0\.113\.7 GET /whoami' && echo "OK   백엔드 요청 로그에 진짜 IP" || { echo "실패 백엔드 요청 로그에 진짜 IP 없음"; fail=1; }
printf '%s\n' "$blog" | grep -q '\[socket\] 203\.0\.113\.7 접속' && echo "OK   소켓 로그에 진짜 IP" || { echo "실패 소켓 로그에 진짜 IP 없음"; fail=1; }

echo
[ $fail -eq 0 ] && echo "[cfcheck] 전부 통과" || { echo "[cfcheck] 실패 있음" >&2; exit 1; }
