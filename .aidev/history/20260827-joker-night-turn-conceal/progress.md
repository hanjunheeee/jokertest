# PROGRESS - 20260827-joker-night-turn-conceal · implement
2026-08-27T01:03:33+09:00

attempt 2   turn 81/80   (stage ended incomplete)

## Done
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\backend\game-core\gameSession.js
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\frontend\src\domains\game\ingame\constants\nightTurn\ingameNightTurnAnnouncement.js
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\frontend\src\domains\game\ingame\hooks\useInGameNightTurnAnnouncement.js
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\frontend\src\domains\game\ingame\utils\selectInGameTimebarStatusMessage.js
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\frontend\src\domains\game\ingame\pages\InGamePage.jsx
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\frontend\src\domains\game\ingame\utils\reduceInGameNightTurnAnnouncement.js
- edited C:\Users\minsa\jokertest_windows-slices\20260827-joker-night-turn-conceal\backend\game-core\__tests__\gameSession.test.js
- ran cd "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal" && grep -n "setGamePayload" -B5 -A 30 frontend/src/domains/game/ingame/store/i...
- ran cd "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal" && sed -n '470,550p' frontend/src/domains/game/ingame/store/__tests__/applySes...
- ran cd "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal" && grep -n "buildNightTurnChangedPayload,\|getLivingNightTurnActorUuids,\|comp...
- ran cd "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal" && grep -n "computeCurrentNightTurnRole" backend/game-core/__tests__/gameSessi...
- ran cd "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal/backend" && npm run test:game-core 2>&1 | tail -40
- ran npm --prefix "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal/backend" run test:game-core 2>&1 | tail -40
- ran npm --prefix "C:/Users/minsa/jokertest_windows-slices/20260827-joker-night-turn-conceal/backend" run test:game-core
- ran npm run test:game-core
- ran pwd && cat package.json | head -20
- ran node --test game-core/__tests__/gameSession.test.js 2>&1 | tail -30
- ran npm test 2>&1 | tail -25
- ran cd ../frontend
- ran node --experimental-test-module-mocks --test src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js 2>&1 | tail -50
- ran node --experimental-test-module-mocks --test src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js
- ran npm test 2>&1 | grep -E "^(ℹ|✖)" | head -40

## Remaining
Named by the plan and not edited yet:
- backend/socket/gameSession.js
- frontend/src/domains/game/ingame/store/ingameStore.js
- .../utils/selectInGameNightTurnRole.js
- useInGameActionPanel.js
- roleComposition.js
- frontend/.../constants/nightTurn/ingameNightTurnAnnouncement.js
- frontend/.../utils/selectInGameNightTurnReel.js
- frontend/.../hooks/useInGameNightTurnAnnouncement.js
- frontend/.../utils/selectInGameTimebarStatusMessage.js
- frontend/.../pages/InGamePage.jsx
- useInGameOverlayStack.js
- components/InGamePlayArea.jsx
- frontend/.../store/applySessionSnapshot.js
- frontend/.../utils/selectInGameNightTurnRole.js
- frontend/.../utils/reduceInGameNightTurnAnnouncement.js
- ... 22 more

## Last words

Now the frontend constants — the reel builder:

Now append the reel builder:

Now the reel selector:

Now the hook:

Now the timebar status message, InGamePage wiring, and snapshot preservation:

Now snapshot preservation:

Now the two documentation-only comment updates:

Now adding the backend tests:

Now let me update the frontend tests. First the announcement hook test:

## Resume

    aidev pipeline --repo C:\Users\minsa\jokertest_windows --resume-slice 20260827-joker-night-turn-conceal
