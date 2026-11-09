#!/usr/bin/env bash
# 관리자 사이트 nginx 확인 파일: 진짜 default.conf + 가짜 백엔드 둘(Node 2개)을 잠깐 docker 망에 켜고 curl로 검사 (AD-290~292)
# 쓰는 법(저장소 루트): bash deploy/ci/scripts/admin-site-check.sh — CI docker-build.sh도 부름, 저장소 파일은 안 바꿈
# 보는 것: admin / 와 화면 주소 = admin.html · 머리글(CSP·noindex) · /admin-api → Node(?node=) · api 사이트 /admin-api 404 · 플레이어 사이트엔 관리자 없음
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
IMAGE="${CHECK_NGINX_IMAGE:-nginx:1.27-alpine}"
NAME="mmc-admincheck-$$"
WORK="$(mktemp -d)"
export MSYS_NO_PATHCONV=1
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

cleanup() {
    docker rm -f "$NAME-nginx" "$NAME-n1" "$NAME-n2" >/dev/null 2>&1 || true
    docker network rm "$NAME" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

# 화면 자리: 플레이어 index.html · 관리자 admin.html + 빌드 파일 하나
mkdir -p "$WORK/html/desktop" "$WORK/html/admin/assets"
echo '<!doctype html><title>player</title><div id="root"></div>' > "$WORK/html/desktop/index.html"
echo '<!doctype html><title>admin</title><div id="admin-root"></div>' > "$WORK/html/admin/admin.html"
echo 'console.log(1)' > "$WORK/html/admin/assets/admin-x.js"

# Node 2개 upstream (진짜 생성기로)
cp -r "$ROOT/nginx/snippets" "$WORK/snippets"
node "$(hostpath "$ROOT/deploy/scripts/gen-nodes.js")" --count 2 --upstreams "$(hostpath "$WORK/snippets/mmc-upstreams.conf")" --compose "$(hostpath "$WORK/nodes.yml")" >/dev/null

# 가짜 백엔드: 받은 경로·Access 머리글·Node 이름을 글자로 돌려줌
stub_conf() {
    printf 'server { listen 4000; location / { default_type text/plain; return 200 "stub=%s path=$uri access=$http_cf_access_jwt_assertion\\n"; } }\n' "$1" > "$WORK/stub-$1.conf"
}
stub_conf n1
stub_conf n2

docker network create "$NAME" >/dev/null
docker run -d --name "$NAME-n1" --network "$NAME" --network-alias backend \
    -v "$(hostpath "$WORK/stub-n1.conf"):/etc/nginx/conf.d/default.conf:ro" "$IMAGE" >/dev/null
docker run -d --name "$NAME-n2" --network "$NAME" --network-alias backend-n2 \
    -v "$(hostpath "$WORK/stub-n2.conf"):/etc/nginx/conf.d/default.conf:ro" "$IMAGE" >/dev/null
docker run -d --name "$NAME-nginx" --network "$NAME" \
    -v "$(hostpath "$ROOT/nginx/default.conf"):/etc/nginx/conf.d/default.conf:ro" \
    -v "$(hostpath "$WORK/snippets"):/etc/nginx/snippets:ro" \
    -v "$(hostpath "$WORK/html"):/usr/share/nginx/html:ro" \
    "$IMAGE" >/dev/null
sleep 2
docker exec "$NAME-nginx" nginx -t 2>&1 | tail -n 1

fail=0
# 요청 하나 (머리글 + 본문), 예: req admin.localhost /members
req() { local host="$1"; shift; docker exec "$NAME-nginx" curl -s -i -H "Host: $host" "$@"; }
# 응답에 글자가 있는지
expect() {
    local label="$1" pattern="$2" text="$3"
    if printf '%s' "$text" | tr -d '\r' | grep -iEq "$pattern"; then echo "OK   $label"; else echo "실패 $label (없음: $pattern)"; fail=1; fi
}
expect_not() {
    local label="$1" pattern="$2" text="$3"
    if printf '%s' "$text" | tr -d '\r' | grep -iEq "$pattern"; then echo "실패 $label (있으면 안 됨: $pattern)"; fail=1; else echo "OK   $label"; fi
}

# AD-291 admin 사이트 화면
r="$(req admin.localhost http://127.0.0.1/)"
expect "admin / = admin.html" 'admin-root' "$r"
expect "admin / 다시 확인(no-cache)" '^cache-control: no-cache' "$r"
# AD-292 머리글
expect "admin CSP default-src self" "^content-security-policy: default-src 'self';.*frame-ancestors 'none'" "$r"
expect "admin X-Robots-Tag noindex" '^x-robots-tag: noindex' "$r"
expect "admin X-Frame-Options DENY" '^x-frame-options: DENY' "$r"
r="$(req admin.localhost http://127.0.0.1/members/abc?x=1)"
expect "admin 화면 주소 → admin.html" 'admin-root' "$r"
r="$(req admin.localhost http://127.0.0.1/assets/admin-x.js)"
expect "admin 빌드 파일 1년" '^cache-control: max-age=31536000' "$r"
expect "admin 빌드 파일에도 CSP" '^content-security-policy: default-src' "$r"
r="$(req admin.localhost http://127.0.0.1/.env)"
expect "admin 숨김 파일 404" '^HTTP/1.1 404' "$r"

# AD-290 /admin-api → Node, Access 머리글 그대로, ?node=로 고르기
r="$(req admin.localhost -H 'Cf-Access-Jwt-Assertion: fake.jwt.value' http://127.0.0.1/admin-api/auth/me)"
expect "admin /admin-api → 백엔드" 'stub=n[12] path=/admin-api/auth/me' "$r"
expect "Access 머리글 넘김" 'access=fake\.jwt\.value' "$r"
r="$(req admin.localhost 'http://127.0.0.1/admin-api/auth/me?node=n2')"
expect "admin ?node=n2 → n2" 'stub=n2 ' "$r"
codes="$(for _ in $(seq 1 12); do docker exec "$NAME-nginx" curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'Host: admin.localhost' http://127.0.0.1/admin-api/auth/login; done)"
expect "admin 로그인 앞단 제한 429" '429' "$codes"

# AD-291 api 사이트 /admin-api 404 (대소문자 상관없이), 플레이어 사이트엔 관리자 없음
r="$(req api.localhost http://127.0.0.1/admin-api/auth/me)"
expect "api /admin-api 404" '^HTTP/1.1 404' "$r"
expect_not "api /admin-api 백엔드 안 감" 'stub=' "$r"
r="$(req api.localhost http://127.0.0.1/ADMIN-API/auth/me)"
expect "api /ADMIN-API 404" '^HTTP/1.1 404' "$r"
r="$(req api.localhost http://127.0.0.1/health)"
expect "api 나머지는 그대로 백엔드" 'stub=n[12] path=/health' "$r"
r="$(req localhost http://127.0.0.1/admin.html)"
expect_not "플레이어 사이트 /admin.html에 관리자 없음" 'admin-root' "$r"
r="$(req localhost http://127.0.0.1/admin-api/auth/me)"
expect_not "플레이어 사이트 /admin-api 백엔드 안 감" 'stub=' "$r"
expect_not "플레이어 사이트 머리글은 관리자 것 아님" '^x-robots-tag' "$r"

[ $fail -eq 0 ] || { echo "[admin-site-check] 실패" >&2; exit 1; }
echo "[admin-site-check] 전부 통과"
