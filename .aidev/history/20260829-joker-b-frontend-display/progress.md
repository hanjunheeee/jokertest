# PROGRESS - 20260829-joker-b-frontend-display · implement
2026-08-29T02:07:27+09:00

attempt 1   turn 81/80   (stage ended incomplete)

## Done
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\backend\game-core\gameSession.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\backend\game-core\__tests__\gameSession.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\buildInGamePreviewPlayers.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\buildPlayerSessionSourceFromGameState.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\mergeSourcePlayerWithPreview.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\__tests__\buildPlayerSessionSourceFromGameState.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\__tests__\buildInGamePreviewPlayers.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\store\__tests__\applySessionSnapshot.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\__tests__\computeResolveNightDayTransitionPatch.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\hooks\useInGameResolveNight.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\components\actions\InGameActionPanel.jsx
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\hooks\__tests__\useInGameResolveNight.test.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\inGameChatChannel.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\utils\isJokerNightChatEligible.js
- edited C:\Users\minsa\jokertest-slices\20260829-joker-b-frontend-display\frontend\src\domains\game\ingame\components\chat\InGameChatShell.jsx
- ... 1 more file(s)
- ran cd C:/Users/minsa/jokertest-slices/20260829-joker-b-frontend-display/backend && npm run test:game-core 2>&1 | tail -25
- ran npm run test:game-core --prefix backend 2>&1 | tail -25
- ran npm run test:game-core --prefix backend
- ran node --test backend/game-core/__tests__/gameSession.test.js 2>&1 | grep -E "^(# (pass|fail|tests))|^✖|not ok" | head -30
- ran node --test backend/game-core/__tests__/gameSession.test.js > /tmp/bt.txt 2>&1; tail -20 /tmp/bt.txt
- ran node --test backend/game-core/__tests__/gameSession.test.js 2>&1 | tail -20
- ran node --test backend/socket/__tests__/matchmaking.test.js 2>&1 | head -30
- ran node --env-file=backend/.env.test --test backend/socket/__tests__/matchmaking.test.js 2>&1 | tail -12
- ran node --env-file=backend/.env.test --test backend/socket/__tests__/matchmaking.test.js
- ran sed -n 1239,1270p backend/socket/__tests__/matchmaking.test.js
- ran npm test --prefix backend 2>&1 | tail -12
- ran rg -n "players:" frontend/src/domains/game/ingame/utils/__tests__/buildPlayerSessionSourceFromGameState.test.js | tail -20
- ran sed -n 248,310p frontend/src/domains/game/ingame/utils/__tests__/buildPlayerSessionSourceFromGameState.test.js
- ran sed -n 720,775p backend/socket/gameSession.js && echo ==== && sed -n 1240,1275p backend/game-core/gameSession.js
- ran cat frontend/src/domains/game/ingame/utils/shouldApplyNightBroadcastPayload.js

## Remaining
Named by the plan and not edited yet:
- frontend/.../utils/assignInGamePlayerThemeIndices.js
- useInGamePlayerSession.js
- InGamePlayerSessionProvider.jsx
- backend/socket/matchmaking.js
- store/applySessionSnapshot.js
- backend/socket/gameSession.js
- shouldAcceptGameChatMessage.js
- gameChatReducer.js
- setup/constants/roleComposition.js
- ingame/constants/roleReveal/ingameRoleRevealData.js
- ingame/constants/nightTurn/ingameNightTurnAnnouncement.js
- hooks/useInGameOverlayStack.js
- useInGameNightTurnAnnouncement.test.js
- useInGameOverlayStack.nightTurn.test.js
- shared/constants/playerPortraitAssets.js
- ... 33 more

## Last words

I'll start by reading the actual code to ground the plan.

Now the backend tests.

Now `mergeSourcePlayerWithPreview`:

Now `applySessionSnapshot.js` — carry themeIndex through hydration:

Now the store contract comment:

Now requirement 1's frontend tests.

Now merge test + new preview determinism test:

Now the snapshot hydration test:

Now requirement 2 — the day-transition patch and hook.

Now the hook:

Now the hook test. Let me check the fake socket harness pattern more fully:

Now requirement 3 — chat channels.

Now the chat channel tests:

Now requirement 4 — GUARD naming.

## Resume

    aidev pipeline --repo C:\Users\minsa\jokertest --resume-slice 20260829-joker-b-frontend-display
