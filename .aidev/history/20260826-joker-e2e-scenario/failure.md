# FAILURE - 20260826-joker-e2e-scenario · verify attempt 1
2026-08-26T14:40:08+09:00

## Command
    (the test stage's own report)                      exit 1   0.0s

## Output (tail 60 lines)
The runner's output could not be summarised, so it is quoted as it came.

    ## frontend 실패 21건 — 전부 모듈 해석 실패
    
    단정 실패(assertion failure)는 **0건**이다. 21건 모두 테스트 파일이 로드조차 되지 못한 파일 단위 실패다.
    
    ```
    Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'react' imported from ...
    ```
    
    누락 패키지 집계: `react` 17건, `zustand` 3건, `jsdom` 1건.
    
    실패 파일 21개:
    
    ```
    src\domains\game\ingame\components\killReveal\__tests__\InGameKillRevealOverlay.test.js
    src\domains\game\ingame\components\nightPrivateResult\__tests__\InGameNightPrivateResultOverlay.test.js
    src\domains\game\ingame\hooks\__tests__\useGameSessionSocketEvents.nightTurn.test.js   (jsdom)
    src\domains\game\ingame\hooks\__tests__\useInGameActionPanel.nightTurn.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameActionPanel.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameControlPanelLayout.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameGameChatSession.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameKillReveal.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameNightTurnAnnouncement.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameOverlayStack.killReveal.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameOverlayStack.nightPrivateResult.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameOverlayStack.nightTurn.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameResultNavigation.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameRoleReveal.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameSessionSnapshotSync.test.js
    src\domains\game\ingame\hooks\__tests__\useInGameTribunalVoteSubmit.test.js
    src\domains\game\ingame\store\__tests__\ingameStore.test.js                            (zustand)
    src\domains\game\matching\store\__tests__\matchingStore.test.js                        (zustand)
    src\domains\game\result\hooks\__tests__\useGameResultData.test.js
    src\domains\game\result\utils\__tests__\createGameResultExitRequest.test.js            (zustand)
    src\domains\game\setup\hooks\__tests__\useRoleCompositionState.test.js
    ```
    
    ### 원인 (환경, 코드 아님)
    
    `frontend/node_modules`는 디렉터리가 아니라 **junction**이고, 그 타깃이 비어 있다:
    
    ```
    FullName : ...\20260826-joker-e2e-scenario\frontend\node_modules
    LinkType : Junction
    Target   : C:\Users\minsa\jokertest_windows\frontend\node_modules   (존재하지만 항목 0개)
    ```
    
    즉 frontend 의존성이 설치되어 있지 않다. 타깃이 내 worktree 밖(사용자 체크아웃)이라 여기에 `npm install`을 하지 않았다 — 지시상 그 경로는 건드리지 않는다. 사람이 `npm install --prefix frontend`를 한 번 돌리면 이 21건은 사라질 성격의 실패다.
    
    이 실패들이 이번 slice와 무관하다는 근거: 실패한 21개 파일 중 이번 지시서의 CREATE/MODIFY 대상은 하나도 없다. 그리고 이번 slice가 추가한 `ingameE2eHooks.test.js`는 9개 단정 **전부 통과**했다(`INGAME_E2E_ATTRS` 동결·접두 검사, 세 빌더의 순수 계약, role/team 비노출, 그리고 `InGameActionPanel`/`InGameTargetPicker`/`InGamePlayerCard` 소스가 실제로 훅을 전개하는지 대조).
    
    ### 돌리지 않은 것
    
    - `npm run lint --prefix frontend`, `npm run build --prefix frontend` — 테스트 스위트가 아니고, eslint/vite 자체가 같은 빈 node_modules에 있어 동일한 이유로 실행 불가다.
    - `npm --prefix e2e test` (Playwright) — `e2e/node_modules` 미설치이며, 계획서상 실제 5창 재생은 merge 후 사람이 하는 범위다.
    
    ## 판정
    
    e2e 헬퍼(36)와 backend game-core(354)는 깨끗하게 통과했지만, frontend 스위트는 21건이 실패한 채 끝났다. 원인이 환경(의존성 미설치)이더라도 스위트가 실패로 끝난 것은 사실이므로 PASS로 보고하지 않는다.
    
    TEST_RESULT: FAIL

## Counts
passed n/a   failed n/a   skipped n/a

full log: (not written)
last commit: 023c166 slice(20260826-joker-e2e-scenario): implement
