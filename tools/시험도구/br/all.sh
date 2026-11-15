#!/usr/bin/env bash
# 되살린 도구(2026-11-10 맥북 이어받기 묶음), 경로만 tools/시험도구 기준으로 바꿈 — 쓰는 법은 docs/게임_의도_2026-11-15/준비_시험환경.md
# 브라우저 점검 전체 순서 (e2e 잠금 안에서)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
B="$HERE/../.run/br"; mkdir -p "$B"
P="bash $HERE/run-phase.sh"
echo "전체 시작 $(date +%H:%M:%S)" >> "$B/timeline.txt"
$P desktop 1 --no-deps --project=desktop
$P mobile 1 --no-deps --project=mobile
$P safari 1 --no-deps --project=mobile-safari
$P admin 1 --no-deps --project=admin --project=admin-phone
FORCE_WORKERS=1 $P serial 1 --no-deps --project=serial
FORCE_WORKERS=1 $P aphserial 1 --no-deps --project=admin-phone-serial
$P mn 2 --no-deps --project=desktop --project=mobile --project=mobile-safari multinode/
FORCE_WORKERS=1 $P mnserial 2 --no-deps --project=serial multinode/
# 서버 2개일 때 모바일 talk-wide (봇 ROOM_ON_OTHER_NODE 확인)
$P mnwide 2 --no-deps --project=mobile mobile/talk-wide
echo "전체 끝 $(date +%H:%M:%S)" >> "$B/timeline.txt"
