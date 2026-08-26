# PROGRESS - 20260826-joker-e2e-wh-scenario · implement
2026-08-26T21:36:04+09:00

attempt 1   turn 81/80   (turn-budget 90%)

## Done
- edited C:\Users\minsa\jokertest_windows-slices\20260826-joker-e2e-wh-scenario\e2e\lib\scenarioPlan.js
- edited C:\Users\minsa\jokertest_windows-slices\20260826-joker-e2e-wh-scenario\e2e\lib\actors.js
- edited C:\Users\minsa\jokertest_windows-slices\20260826-joker-e2e-wh-scenario\e2e\lib\__tests__\scenarioPlan.test.js
- edited C:\Users\minsa\jokertest_windows-slices\20260826-joker-e2e-wh-scenario\e2e\README.md
- ran npm run test:e2e-helpers
- ran node --test "e2e/lib/__tests__/*.test.js"
- ran npm --prefix frontend test
- ran npm test --prefix frontend
- ran npm install --prefix frontend --no-audit --no-fund
- ran npm install --prefix frontend
- ran node --check e2e/tests/tenDayScenario.spec.js
- ran npm run test:game-core --prefix backend
- ran npm test --prefix backend
- ran grep -n "test:game-core" backend/package.json
- ran node --test --test-reporter=dot "backend/game-core/__tests__/*.test.js"

## Remaining
Named by the plan and not edited yet:
- backend/game-core/gameSession.js
- backend/socket/gameSession.js
- constants/actions/ingameActionPanel.js
- utils/buildNightActionTargets.js
- InGameTargetPicker.jsx
- components/actions/InGameActionPanel.jsx
- constants/nightTurn/ingameNightTurnAnnouncement.js
- utils/reduceInGameNightPrivateResult.js
- ingameRoleRevealData.js
- result/utils/buildGameResultViewModel.js
- result/page/GameResultPage.jsx
- createSessionEndFinalizer.js
- tests/tenDayScenario.spec.js
- buildGameResultViewModel.js
- playwright.config.js
- ... 17 more

## Last words

## 완료

### 변경 파일 (지시서 8건, 그 외 없음)

| 파일 | 내용 |
| --- | --- |
| `e2e/lib/scenarioPlan.js` | 타임라인 재정의(치명 밤 1 · 평범한 밤 2~9 · 최종 낮 10), `VICTIM_SEAT`/`ASSASSINATION_TARGET_SEAT`/`NORMAL_NIGHT_DAY_INDEXES` 신설, GUARD 풀을 `[JOKER, DOCTOR, WITCH_HUNTER]`로 축소, `deadSeatsAtNight`/`deadSeatsAtDay`/`aliveSeatsAtDay`/`expectedNightTurnMessage` 신설, `witchHunterCanActOn`을 시신 타임라인 기준으로 재작성, `planNight`에 `turnExpected`·`deadSeats`, `planDay`에 `aliveSeatCount`·`deadSeats` 추가 |
| `e2e/lib/failureLog.js` (신규) | soft-assert 실패 수집기·요약 포매터(순수) |
| `e2e/lib/actors.js` | `captureStep`·`softly`·`assertNightTurnAbsent`·`assertNightActionTargets`·`returnToLobby` 신설, `assertNightActionPanel`의 null 분기가 이제 CITIZEN 전용임을 spec에 명시 |
| `e2e/tests/tenDayScenario.spec.js` | 새 타임라인으로 재구성 + 관측 검증 soft-assert화 + 단계별 스크린샷 + 종료 시 요약 throw + 5창 로비 이탈 |
| `e2e/lib/__tests__/scenarioPlan.test.js` | 새 밤낮 계획·생존자 기준 계산·WH 시신 규칙으로 갱신 |
| `e2e/lib/__tests__/failureLog.test.js` (신규) | 수집·복사본 격리·요약 포맷 |
| `e2e/playwright.config.js` | 타임아웃 15분 → 20분 |
| `e2e/README.md` | 타임라인 표, WH 시신 규칙, 대상 목록 잠금 계약, 어휘 차이, `/multiplay` 경로, soft-assert 운영 |

### 검증 결과

- **`node --test e2e/lib/__tests__/*.test.js` — 53/53 PASS** (요구서 검증 ①)
- backend g...

## Resume

    aidev pipeline --repo C:\Users\minsa\jokertest_windows --resume-slice 20260826-joker-e2e-wh-scenario
