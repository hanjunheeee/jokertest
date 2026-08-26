# PROGRESS - 20260826-joker-e2e-scenario · plan
2026-08-26T14:11:12+09:00

attempt 1   turn 111/80   (turn-budget 90%)

## Done
- (no file was edited)

## Remaining
- (nothing the plan names is untouched - check the plan itself)

## Last words

# E2E 멀티 클라이언트 10일차 시나리오 — 구현 계획

## 0. 이 계획이 서 있는 사실 (실제 코드 확인 결과)

읽은 파일에서 확정한 것들. 스크립트의 모든 분기가 여기에 매달려 있다.

**역할 배정 / 방 설정**
- `resolveDebugFixedRoleAssignment`(`backend/game-core/gameSession.js:365`)는 고정 목록의 역할별 개수가 그 방의 canonical 구성과 **정확히 일치할 때만** 적용되고, 아니면 경고 한 줄 남기고 **랜덤으로 되돌아간다**.
- `getSpecialRoleBudget(5)`는 `{DOCTOR:0, GUARD:0, WITCH_HUNTER:0}`(`backend/game-core/roleComposition.js:43`). 즉 **5인 AUTO 방은 JOKER 1 + CITIZEN 4**가 되고, `DEBUG_FIXED_ROLES=JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN`은 `COMPOSITION_MISMATCH`로 조용히 무시된다.
- 따라서 스크립트는 방을 반드시 **CUSTOM(직접 지정)** 으로 만들어야 한다: 최대 플레이어 5, 역할 구성 "직접 지정", 광대 1 · 의사 1 · 경비대 1 · 마녀사냥꾼 1 → CITIZEN은 서버가 `5-4=1`로 파생(`resolveRoleComposition:228`).
- `computeCanStart`(`backend/socket/matchmaking.js:215`)는 **방장 포함 전원 `isReady===true`** 를 요구한다.

**단계 흐름 (요구서와 다른 지점 — §6 참조)**
- `INITIAL_GAME_PHASE='ROLE_REVEAL'`, `INITIAL_DAY_INDEX=0`. 전원 역할 확인이 끝나면 `enterDayPhase`로 **DAY dayIndex 1**로 진입한다(`gameSession.js:756,822`). 게임의 첫 진행 단계는 밤이 아니라 **낮**이다.
- `dayIndex` 증가는 오직 `enterDayPhase`(NIGHT→DAY)에서만 일어난다. DAY→NIGHT(`commitDayVoteResolution:1481`)와 TRIBUNAL→NIGHT는 dayIndex를 유지한다.
- 실제 순서: `ROLE_REVEAL(0) → DAY(1) → NIGHT(1) → DAY(2) → NIGHT(2) →...

## Resume

    aidev pipeline --repo C:\Users\minsa\jokertest_windows --resume-slice 20260826-joker-e2e-scenario
