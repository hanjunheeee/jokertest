#!/usr/bin/env bash
# 배포 뒤 확인 파일(러너에서, 바깥 주소로), API /health 200 · 데스크톱·모바일 첫 화면 200 · 소켓 101 · 폰 302 저장 안 함
# 받는 값: SMOKE_API_URL(예: https://api.example.com), SMOKE_DESKTOP_URL, SMOKE_MOBILE_URL — 비면 그 칸 건너뜀
#   SMOKE_EXPECT_CLOUDFLARE=1 → 클라우드플레어를 거치는지(cf-ray)도 봄
#   SMOKE_ADMIN_URL(예: https://admin.example.com) → 관리자 사이트: 클라우드플레어면 Access 로그인으로 302, 아니면 200·noindex,
#     api 사이트 /admin-api 404 · 데스크톱 /admin.html에 관리자 화면 없음 (docs/배포_설정.md 8장)
#   SMOKE_NODES=n1,n2,… (또는 SMOKE_EXPECT_NODES=2 → n1..n2) → Node마다 /health?node=<id>가 그 Node에서 답하는지(serverId)·redis up·draining 아님,
#     소켓 101도 ?node=<id>로 Node마다 (nginx $arg_node 고르기·backup 확인, docs/배포_설정.md 7장)
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
# Node 여러 개: 확인할 Node 이름들 (SMOKE_NODES가 먼저, 없으면 SMOKE_EXPECT_NODES 수만큼 n1..)
node_ids=""
if [ -n "${SMOKE_NODES:-}" ]; then
    node_ids="${SMOKE_NODES//,/ }"
elif [ "${SMOKE_EXPECT_NODES:-0}" -gt 1 ] 2>/dev/null; then
    node_ids="$(seq -f 'n%g' 1 "$SMOKE_EXPECT_NODES" | tr '\n' ' ')"
fi

# Node 하나: /health?node=<id> 답이 그 Node(serverId)·redis up·draining 아님인지 (몇 번 다시)
expect_node() {
    local id="$1" body="" ok=""
    for _ in $(seq 1 "$retries"); do
        body="$(curl -s --max-time 10 "${SMOKE_API_URL%/}/health?node=$id" || true)"
        # 답 글자에서 바로 봄 (러너에 node 없어도 되게): 그 Node가 답했는지·redis up·draining 아님
        if ! printf '%s' "$body" | grep -q "\"serverId\":\"$id\""; then ok="답한 Node 다름: ${body:0:80}"
        elif ! printf '%s' "$body" | grep -q '"redis":"up"'; then ok="redis up 아님"
        elif printf '%s' "$body" | grep -q '"draining":true'; then ok="draining"
        else ok="OK"; fi
        [ "$ok" = "OK" ] && { echo "OK   Node $id /health (serverId·redis up)"; return 0; }
        sleep 6
    done
    echo "실패 Node $id /health ($ok)"; fail=1
}
if [ -n "$node_ids" ] && [ -n "${SMOKE_API_URL:-}" ]; then
    for id in $node_ids; do
        expect_node "$id"
        expect_status "Node $id 소켓 101" 101 --http1.1 -N --max-time 5 \
            -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
            -H "Sec-WebSocket-Key: $(head -c 16 /dev/urandom | base64)" -H "Origin: ${origin%/}" \
            "${SMOKE_API_URL%/}/socket.io/?EIO=4&transport=websocket&node=$id"
    done
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

# 관리자 페이지: Access 없이 열면 클라우드플레어 로그인으로 감 (원본까지 안 옴), api·플레이어 주소엔 관리자 없음
if [ -n "${SMOKE_ADMIN_URL:-}" ]; then
    if [ "${SMOKE_EXPECT_CLOUDFLARE:-0}" = "1" ]; then
        expect_status "관리자 Access 없이 → 302" 302 "${SMOKE_ADMIN_URL%/}/"
        expect_header "관리자 → Access 로그인" '^location: *https://[^/]+\.cloudflareaccess\.com/' "${SMOKE_ADMIN_URL%/}/"
        expect_status "관리자 서버 경로 Access 없이 → 원본 안 옴" 302 "${SMOKE_ADMIN_URL%/}/admin-api/auth/me"
    else
        expect_status "관리자 첫 화면" 200 "${SMOKE_ADMIN_URL%/}/"
        expect_header "관리자 noindex" '^x-robots-tag: *noindex' "${SMOKE_ADMIN_URL%/}/"
    fi
fi
[ -n "${SMOKE_ADMIN_URL:-}" ] && [ -n "${SMOKE_API_URL:-}" ] && expect_status "api 주소 /admin-api 404" 404 "${SMOKE_API_URL%/}/admin-api/auth/me"
if [ -n "${SMOKE_ADMIN_URL:-}" ] && [ -n "${SMOKE_DESKTOP_URL:-}" ]; then
    if curl -s --max-time 10 "${SMOKE_DESKTOP_URL%/}/admin.html" | grep -q 'admin-root'; then
        echo "실패 데스크톱 /admin.html에 관리자 화면"; fail=1
    else
        echo "OK   데스크톱 주소엔 관리자 화면 없음"
    fi
fi

if [ -d "$ROOT/e2e/tests/prod-smoke" ]; then
    echo "[smoke] e2e/tests/prod-smoke 있음 → 이어서 돌리는 자리 (아직 연결 안 함)"
fi

[ $fail -eq 0 ] || { echo "[smoke] 확인 실패" >&2; exit 1; }
echo "[smoke] 전부 통과"
