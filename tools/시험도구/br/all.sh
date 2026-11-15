#!/usr/bin/env bash
# 되살린 도구(2026-11-10 맥북 이어받기 묶음), 경로만 tools/시험도구 기준으로 바꿈 — 쓰는 법은 docs/게임_의도_2026-11-15/준비_시험환경.md
# 브라우저 점검 전체 순서 (e2e 잠금 안에서): desktop → mobile → safari(@safari) → admin → @hard → serial → 서버 2개
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
B="$HERE/../.run/br"; mkdir -p "$B"
P="bash $HERE/run-phase.sh"
echo "전체 시작 $(date +%H:%M:%S)" >> "$B/timeline.txt"
# 어려운 것(@hard, 사람 여럿·긴 판)은 앞 단계에서 빼고 따로 한 단계 (작업자 3, 브라우저 창이 많아서)
$P desktop 1 --no-deps --project=desktop --grep-invert=@hard
$P mobile 1 --no-deps --project=mobile --grep-invert=@hard
# 사파리는 설정에서 @safari 붙인 것만 돎
$P safari 1 --no-deps --project=mobile-safari --grep-invert=@hard
$P admin 1 --no-deps --project=admin --project=admin-phone --grep-invert=@hard
FORCE_WORKERS=3 $P hard 1 --no-deps --project=desktop --project=mobile --project=mobile-safari --project=admin --project=admin-phone --grep=@hard
FORCE_WORKERS=1 $P serial 1 --no-deps --project=serial
FORCE_WORKERS=1 $P aphserial 1 --no-deps --project=admin-phone-serial
$P mn 2 --no-deps --project=desktop --project=mobile --project=mobile-safari multinode/
FORCE_WORKERS=1 $P mnserial 2 --no-deps --project=serial multinode/
# 서버 2개일 때 모바일 talk-wide (봇 ROOM_ON_OTHER_NODE 확인) — 옛 시험은 지워짐, 새로 생겼을 때만 돎 (없으면 "No tests found"로 실패해서)
if ls "$HERE"/../../../e2e/tests/mobile/talk-wide* >/dev/null 2>&1; then
  $P mnwide 2 --no-deps --project=mobile mobile/talk-wide
fi
echo "전체 끝 $(date +%H:%M:%S)" >> "$B/timeline.txt"
