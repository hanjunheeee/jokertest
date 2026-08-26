# FAILURE - 20260826-joker-result-lobby-button · verify attempt 1
2026-08-26T13:15:14+09:00

## Command
    (the test stage's own report)                      exit 1   0.0s

## Output (tail 60 lines)
The runner's output could not be summarised, so it is quoted as it came.

    - 통과한 개별 테스트: **566**
    - 실패한 테스트 파일: **21** (프로세스 exit code 1)
    - 실패 원인은 21개 파일 전부 동일한 `ERR_MODULE_NOT_FOUND`입니다 — `react` 17건, `zustand` 3건, `jsdom` 1건.
    
    ```
    Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'react' imported from
      C:\...\frontend\src\domains\game\ingame\components\killReveal\__tests__\InGameKillRevealOverlay.test.js
        at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
        at packageResolve (node:internal/modules/esm/resolve:768:81)
        ...
      code: 'ERR_MODULE_NOT_FOUND'
    ```
    
    ```
    Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'zustand' imported from
      C:\...\frontend\src\domains\game\ingame\store\ingameStore.js
    Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'zustand' imported from
      C:\...\frontend\src\domains\game\matching\store\matchingStore.js
    ```
    
    실패 파일 전체 목록:
    
    ```
    src\domains\game\ingame\components\killReveal\__tests__\InGameKillRevealOverlay.test.js
    src\domains\game\ingame\components\nightPrivateResult\__tests__\InGameNightPrivateResultOverlay.test.js
    src\domains\game\ingame\hooks\__tests__\useGameSessionSocketEvents.nightTurn.test.js
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
    src\domains\game\ingame\store\__tests__\ingameStore.test.js
    src\domains\game\matching\store\__tests__\matchingStore.test.js
    src\domains\game\result\hooks\__tests__\useGameResultData.test.js
    src\domains\game\result\utils\__tests__\createGameResultExitRequest.test.js
    src\domains\game\setup\hooks\__tests__\useRoleCompositionState.test.js
    ```
    
    ## 왜 실패했는가
    
    이 워크트리에는 `frontend/node_modules`가 존재하지 않습니다(`.gitignore` 대상이라 새 워크트리에 딸려오지 않음). `react`/`zustand`/`jsdom`을 import하는 테스트는 전부 모듈 해석 단계에서 죽고, 소스 문자열만 읽는 테스트(566건)만 통과합니다. 이번 슬라이스가 새로 만든 `createGameResultExitRequest.test.js`도 실 `ingameStore.js`를 물고 있어 `zustand` 미설치로 실패했습니다 — 단언 실패가 아니라 의존성 미설치 실패입니다. (같은 슬라이스의 `useGameResultLobbyExit.test.js`와 `GameResultPage.productionSource.test.js`는 소스 검증이라 실패 목록에 없습니다.)
    
    의존성을 설치해 다시 돌리려 했으나 거부되었습니다. 실행한 명령과 그 응답을 그대로 옮깁니다:
    
    - 명령: `npm install --prefix frontend --no-audit --no-fund`
    - 응답: `This command requires approval`
    
    무인 실행이라 승인을 받을 수 없고, 사전 승인 목록에는 설치 명령이 없습니다. 따라서 스위트를 온전한 상태로 실행하지 못했습니다. `npm run build`도 같은 이유로 의미 있는 실행이 불가능해 시도하지 않았습니다(vite 미설치).
    
    지시대로 코드를 고치거나 테스트를 통과하도록 수정하지 않았습니다. 워크트리는 `git status` 기준 clean 상태이며, 임시로 만든 로그 파일(`fe-test.log`)은 삭제했습니다.
    
    TEST_RESULT: FAIL

## Counts
passed n/a   failed n/a   skipped n/a

full log: (not written)
last commit: 009a1d1 slice(20260826-joker-result-lobby-button): implement
