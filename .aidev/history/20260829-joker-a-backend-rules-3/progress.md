# PROGRESS - 20260829-joker-a-backend-rules-3 · implement
2026-08-29T01:16:41+09:00

attempt 1   turn 81/80   (stage ended incomplete)

## Done
- edited C:\Users\minsa\jokertest-slices\20260829-joker-a-backend-rules-3\backend\game-core\gameSession.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-a-backend-rules-3\backend\game-core\roleComposition.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-a-backend-rules-3\backend\game-core\__tests__\roleComposition.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-a-backend-rules-3\backend\game-core\__tests__\gameSession.test.js
- ran cd "C:/Users/minsa/jokertest-slices/20260829-joker-a-backend-rules-3/backend" && node --test game-core/__tests__/roleComposition.test.js 2>&1 | grep -E "^(✖|...
- ran cd "C:/Users/minsa/jokertest-slices/20260829-joker-a-backend-rules-3/backend" && node --test game-core/__tests__/roleComposition.test.js 2>&1 | tail -12

## Remaining
Named by the plan and not edited yet:
- useInGameActionPanel.js
- backend/utils/createRoomValidation.js
- createRoomValidation.js
- matchmaking.js
- frontend/src/domains/game/setup/constants/roleComposition.js
- frontend/src/domains/game/setup/utils/__tests__/roleComposition.test.js
- socket/__tests__/gameSession.test.js
- socket/__tests__/matchmaking.test.js
- utils/__tests__/createRoomValidation.test.js
- src/domains/game/setup/utils/__tests__/roleComposition.test.js
- src/domains/game/setup/utils/__tests__/buildCreateRoomPayload.test.js
- src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js
- frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js
- frontend/src/domains/game/setup/constants/gameSetupOptions.js
- frontend/src/domains/game/setup/utils/roleComposition.js
- ... 2 more

## Last words

I'll start by reading the actual code in scope.

Now the session candidate fields and DAY-state helpers:

Now `enterDayPhase`:

Now `requiresAliveTarget` and the guard investigation result:

Now `submitNightAction` — docblock and target validation:

Now `prepareNightResolution` re-validation + docblock:

Now `tallyDayVoteOutcome`:

Now `prepareDayVoteResolution`:

Now `commitDayVoteResolution`:

Now the tribunal execution payload (`executedRole`) and the snapshot:

Now the snapshot's `dayVoteResolution` fields and `__testables`:

Now `roleComposition.js` (backend) — the 2-person cap:

Now the frontend constant:

Now let me run the backend tests to see the damage before writing new tests.

Now the new cap tests:

Now the main gameSession test file:

Now updating the ROLE_DEFINITIONS, eligibility, and WH tests:

## Resume

    aidev pipeline --repo C:\Users\minsa\jokertest --resume-slice 20260829-joker-a-backend-rules-3
