#!/usr/bin/env bash
# 본보기 사본임: <임시 폴더>·<저장소>를 내 컴퓨터 경로로 바꿔 써야 함
# 브라우저 점검 전체 순서 (e2e 잠금 안에서)
B="<임시 폴더>/br"
P="bash $B/run-phase.sh"
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
