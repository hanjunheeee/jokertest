# FAILURE - 20260822-joker-game-result-wire · verify attempt 1
2026-08-23T00:13:00+09:00

## Command
    (the test stage's own report)                      exit 1   0.0s

## Output (tail 60 lines)
The runner's output could not be summarised, so it is quoted as it came.

    ℹ duration_ms 5595.2433
    ```
    
    Exit code 1.
    
    ## Failures — 18 files, all the same cause
    
    Every failing file crashes at import time before any assertion runs:
    
    ```
    Error: Cannot find module '@exodus/bytes/encoding-lite.js'
    Require stack:
    - C:\Users\minsa\jokertest_windows\frontend\node_modules\html-encoding-sniffer\lib\html-encoding-sniffer.js
    - C:\Users\minsa\jokertest_windows\frontend\node_modules\jsdom\lib\api.js
      code: 'MODULE_NOT_FOUND'
    ```
    
    Failing files:
    
    | # | File |
    | --- | --- |
    | 1 | `src/domains/game/ingame/components/killReveal/__tests__/InGameKillRevealOverlay.test.js` |
    | 2 | `src/domains/game/ingame/components/nightPrivateResult/__tests__/InGameNightPrivateResultOverlay.test.js` |
    | 3 | `src/domains/game/ingame/hooks/__tests__/useGameSessionSocketEvents.nightTurn.test.js` |
    | 4 | `src/domains/game/ingame/hooks/__tests__/useInGameActionPanel.nightTurn.test.js` |
    | 5 | `src/domains/game/ingame/hooks/__tests__/useInGameActionPanel.test.js` |
    | 6 | `src/domains/game/ingame/hooks/__tests__/useInGameControlPanelLayout.test.js` |
    | 7 | `src/domains/game/ingame/hooks/__tests__/useInGameGameChatSession.test.js` |
    | 8 | `src/domains/game/ingame/hooks/__tests__/useInGameKillReveal.test.js` |
    | 9 | `src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js` |
    | 10 | `src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.killReveal.test.js` |
    | 11 | `src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightPrivateResult.test.js` |
    | 12 | `src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightTurn.test.js` |
    | 13 | `src/domains/game/ingame/hooks/__tests__/useInGameResultNavigation.test.js` *(new this slice)* |
    | 14 | `src/domains/game/ingame/hooks/__tests__/useInGameRoleReveal.test.js` |
    | 15 | `src/domains/game/ingame/hooks/__tests__/useInGameSessionSnapshotSync.test.js` |
    | 16 | `src/domains/game/ingame/hooks/__tests__/useInGameTribunalVoteSubmit.test.js` |
    | 17 | `src/domains/game/result/hooks/__tests__/useGameResultData.test.js` *(new this slice)* |
    | 18 | `src/domains/game/setup/hooks/__tests__/useRoleCompositionState.test.js` |
    
    Each reports only `'test failed'` in the failing-tests section because the process aborts during module load — no assertion output exists.
    
    ## Diagnosis (reported, not fixed)
    
    The 18 failing files are **exactly** the 18 files in `frontend/src` that import `jsdom` (verified by grep — the sets match one-for-one). This is an environment defect, not an assertion failure:
    
    - `frontend/node_modules` in this worktree is a symlink → `C:\Users\minsa\jokertest_windows\frontend\node_modules`.
    - In that shared install, `jsdom` → `html-encoding-sniffer` requires `@exodus/bytes/encoding-lite.js`, and `node_modules/@exodus/` does not exist at all (glob returns nothing).
    
    I did not run `npm install` or otherwise touch that shared `node_modules` — it lives in the user's own checkout, outside this worktree.
    
    Per stage instructions I made no code or test changes.
    
    ## What did pass
    
    All 606 non-jsdom tests passed, including this slice's pure-function and raw-source tests: `buildGameResultViewModel.test.js`, `normalizeWinResult`-driven parser tests (`applySessionSnapshot.test.js`, `applyTribunalResolved.test.js`, `parseNightResultAppliedPayload.test.js`), `GameResultPage.productionSource.test.js`, and `InGamePage.productionSource.test.js`. The two slice tests that could not run (`useGameResultData`, `useInGameResultNavigation`) are blocked solely by the broken jsdom install, not by their own content.
    
    `npm run build` was not attempted — it is outside the pre-approved command list for this stage.
    
    TEST_RESULT: FAIL

## Counts
passed n/a   failed n/a   skipped n/a

full log: (not written)
last commit: b8acef0 slice(20260822-joker-game-result-wire): implement
