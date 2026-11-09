#!/usr/bin/env bash
# 배포 뒤 확인 파일(러너에서, 바깥 주소로), API /health 200 · 데스크톱·모바일 첫 화면 200 · 소켓 101 · 폰 302 저장 안 함
# 받는 값: SMOKE_API_URL(예: https://api.example.com), SMOKE_DESKTOP_URL, SMOKE_MOBILE_URL — 비면 그 칸 건너뜀
#   SMOKE_EXPECT_CLOUDFLARE=1 → 클라우드플레어를 거치는지(cf-ray)도 봄
# 배포 확인용 브라우저 묶음(e2e/tests/prod-smoke)이 생기면 여기서 이어 부름 (지금은 없음 → 자리만)
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

retries="${SMOKE_RETRIES:-10}"
fail=0

# 주소 하나가 기대 코드인지 (켜지는 동안 몇 번 다시)
expect_status() {
    local label="$1" expected="$2"; shift 2
    local code=""
    for _ in $(seq 1 "$retries"); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" || true)"
        [ "$code" = "$expected" ] && { echo "OK   $label ($code)"; return 0; }
        sleep 6
    done
    echo "실패 $label (기대 $expected, 받음 ${code:-없음})"; fail=1
}

if [ -n "${SMOKE_API_URL:-}" ]; then
    expect_status "API /health" 200 "${SMOKE_API_URL%/}/health"
    # socket.io 웹소켓 손잡기: 101이면 nginx Upgrade 넘기기·Origin 검사 통과 (101 뒤 연결은 시간 초과로 끊음)
    origin="${SMOKE_DESKTOP_URL:-${SMOKE_API_URL}}"
    expect_status "소켓 101" 101 --http1.1 -N --max-time 5 \
        -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: $(head -c 16 /dev/urandom | base64)" -H "Origin: ${origin%/}" \
        "${SMOKE_API_URL%/}/socket.io/?EIO=4&transport=websocket"
fi
[ -n "${SMOKE_DESKTOP_URL:-}" ] && expect_status "데스크톱 첫 화면" 200 "${SMOKE_DESKTOP_URL%/}/"
# 모바일은 폰 UA로 (데스크톱 UA면 모바일 주소는 그대로, 폰 UA 데스크톱 주소는 m.으로 302)
[ -n "${SMOKE_MOBILE_URL:-}" ] && expect_status "모바일 첫 화면" 200 -A "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile" "${SMOKE_MOBILE_URL%/}/"

# 머리말 하나가 들어 있는지 (대소문자 안 가림)
expect_header() {
    local label="$1" pattern="$2"; shift 2
    if curl -s -o /dev/null -D - --max-time 10 "$@" | tr -d '\r' | grep -iEq "$pattern"; then
        echo "OK   $label"
    else
        echo "실패 $label (머리말 없음: $pattern)"; fail=1
    fi
}
# 폰 302는 클라우드플레어에도 저장 안 됨 (저장되면 PC도 m.으로 감)
if [ -n "${SMOKE_DESKTOP_URL:-}" ]; then
    expect_header "폰 302 Cache-Control no-store" '^cache-control: *no-store' \
        -A "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile" "${SMOKE_DESKTOP_URL%/}/"
fi
# SMOKE_EXPECT_CLOUDFLARE=1이면 클라우드플레어를 거치는지 (cf-ray 머리말)
if [ "${SMOKE_EXPECT_CLOUDFLARE:-0}" = "1" ]; then
    [ -n "${SMOKE_API_URL:-}" ] && expect_header "API 클라우드플레어 거침" '^cf-ray:' "${SMOKE_API_URL%/}/health"
    [ -n "${SMOKE_DESKTOP_URL:-}" ] && expect_header "데스크톱 클라우드플레어 거침" '^cf-ray:' "${SMOKE_DESKTOP_URL%/}/"
fi

if [ -d "$ROOT/e2e/tests/prod-smoke" ]; then
    echo "[smoke] e2e/tests/prod-smoke 있음 → 이어서 돌리는 자리 (아직 연결 안 함)"
fi

[ $fail -eq 0 ] || { echo "[smoke] 확인 실패" >&2; exit 1; }
echo "[smoke] 전부 통과"
