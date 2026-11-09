#!/usr/bin/env bash
# 클라우드플레어 IP 범위 새로 받기 파일, nginx/snippets/cloudflare-realip.conf를 통째로 다시 씀
# 쓰는 법(저장소 루트나 아무 곳): bash deploy/scripts/update-cloudflare-ips.sh → git diff로 바뀐 줄 보고 커밋·배포
# 범위가 바뀌었는데 안 받으면 새 범위로 들어온 사람은 클라우드플레어 IP로 보여 요청 제한을 같이 맞음
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-$ROOT/nginx/snippets/cloudflare-realip.conf}"
V4_URL="https://www.cloudflare.com/ips-v4"
V6_URL="https://www.cloudflare.com/ips-v6"

# 받은 글에서 범위 모양 줄만 (빈 줄·이상한 글자 섞이면 멈춤, 반쯤 받은 파일로 덮기 막기)
fetch_ranges() {
    local url="$1" pattern="$2" body
    body="$(curl -fsS --max-time 20 --retry 2 "$url")"
    body="$(printf '%s\n' "$body" | tr -d '\r' | sed '/^[[:space:]]*$/d')"
    if [ -z "$body" ] || printf '%s\n' "$body" | grep -Ev "$pattern" >/dev/null; then
        echo "범위 모양 아닌 줄 있음 또는 비었음: $url" >&2
        exit 1
    fi
    printf '%s\n' "$body"
}

v4="$(fetch_ranges "$V4_URL" '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$')"
v6="$(fetch_ranges "$V6_URL" '^[0-9a-fA-F:]+/[0-9]{1,3}$')"
today="$(date +%Y-%m-%d)"

tmp="$(mktemp)"
{
    echo "# 클라우드플레어 뒤 진짜 사용자 IP 조각, default.conf의 화면·모바일·API 사이트가 include"
    echo "# 이 범위에서 온 요청만 CF-Connecting-IP를 믿음 → 다른 IP가 이 머리말을 넣어도 무시"
    echo "#"
    echo "# 받은 날짜: $today ($V4_URL · $V6_URL)"
    echo "# 손으로 고치지 말고 다시 받기: bash deploy/scripts/update-cloudflare-ips.sh"
    echo "# 클라우드플레어 없이 바로 들어온 요청은 \$remote_addr 그대로 (깨지는 것 없음)"
    echo
    echo "# IPv4"
    printf '%s\n' "$v4" | sed 's/^/set_real_ip_from /; s/$/;/'
    echo
    echo "# IPv6"
    printf '%s\n' "$v6" | sed 's/^/set_real_ip_from /; s/$/;/'
    echo
    echo "# 클라우드플레어가 붙이는 진짜 사용자 IP 머리말 (한 개 값이라 X-Forwarded-For보다 확실)"
    echo "real_ip_header CF-Connecting-IP;"
} > "$tmp"

mv "$tmp" "$OUT"
echo "다시 씀: $OUT (IPv4 $(printf '%s\n' "$v4" | wc -l)줄 · IPv6 $(printf '%s\n' "$v6" | wc -l)줄)"
echo "네이버 클라우드 ACG(80·443 허용 목록)도 같은 범위로 맞추기: docs/배포_설정.md 클라우드플레어 장"
