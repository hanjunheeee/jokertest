# FAILURE - 20260822-joker-game-result-reveal · verify attempt 1
2026-08-22T06:02:33+09:00

## Command
    (the test stage's own report)                      exit 1   0.0s

## Output (tail 60 lines)
The runner's output could not be summarised, so it is quoted as it came.

    ```
    npm test --prefix backend
    ```
    (= `backend/package.json` 의 `"test": "node --env-file=.env.test --test"`. 루트 `package.json` 의 `test` 는 `echo "Error: no test specified" && exit 1` 스텁이라 실제 스위트는 backend 쪽이다. `--prefix backend` 로 체이닝 없이 단일 명령으로 실행했다.)
    
    세부 확인용으로 `npm test --prefix backend -- --test-reporter=dot` 및 파일 단위 실행을 추가로 돌렸다. **npm install / npm ci 는 실행하지 않았다.**
    
    ## 결과
    
    | 항목 | 수 |
    | --- | --- |
    | 전체 테스트 | 358 |
    | PASS | 353 |
    | FAIL | 5 |
    | exit code | 1 |
    
    - `game-core/__tests__/gameSession.test.js` + `game-core/__tests__/roleComposition.test.js` → 340개 전부 PASS (exit 0). 이번 슬라이스가 신설/갱신한 `buildTerminalFields` reveals 단위·방어·불변성 테스트와 스냅샷 테스트, 비밀 검사기 예외가 모두 여기에 포함되며 전부 통과했다.
    - `utils/__tests__/*` 13개 PASS.
    - `socket/__tests__/*` **5개 파일 전부 FAIL**.
    
    ## 실패 상세 (5건 모두 모듈 로드 단계에서 죽음 — 테스트 본문은 한 줄도 실행되지 않음)
    
    **1) `socket/__tests__/socket.test.js:1:1`**
    ```
    Error: Cannot find module 'socket.io'
    Require stack:
    - backend\socket\socket.js
    - backend\socket\__tests__\socket.test.js
      code: 'MODULE_NOT_FOUND'
        at Object.<anonymous> (backend\socket\socket.js:1:20)
    ```
    
    **2) `socket/__tests__/gameSession.test.js:1:1`**
    ```
    Error: Cannot find module 'sequelize'
    Require stack:
    - backend\models\index.js
    - backend\repositories\user.repositories.js
    - backend\socket\matchmaking.js
    - backend\socket\gameSession.js
    - backend\socket\__tests__\gameSession.test.js
      code: 'MODULE_NOT_FOUND'
        at Object.<anonymous> (backend\models\index.js:6:19)
    ```
    
    **3) `socket/__tests__/nightTurnProgression.test.js:1:1`** — 위와 동일한 `Cannot find module 'sequelize'` (require stack 마지막만 `nightTurnProgression.test.js`).
    
    **4) `socket/__tests__/matchmaking.test.js:1:1`** — 동일한 `Cannot find module 'sequelize'` (스택: `models/index.js` ← `repositories/user.repositories.js` ← `socket/matchmaking.js` ← 테스트).
    
    **5) `socket/__tests__/publicRooms.test.js:1:1`** — 동일한 `Cannot find module 'sequelize'`.
    
    ## 원인 (진단만, 수정 안 함)
    
    이 워크트리에 `backend/node_modules` 도 루트 `node_modules` 도 **존재하지 않는다** (`Glob backend/node_modules/*/package.json`, `node_modules/*/package.json` 둘 다 0건). 요구사항이 "backend에서 npm install/ci 절대 금지 — 기존 node_modules 사용"이라고 못박았는데 그 "기존 node_modules"가 이 워크트리에는 없어서 외부 의존성(`socket.io`, `sequelize`)을 require하는 socket 계층 테스트 5개 파일이 모두 로드에 실패한다. 의존성이 필요 없는 `game-core`/`utils` 테스트만 실행 가능했다.
    
    따라서 이 실패는 이번 슬라이스의 코드 변경과 무관한 환경 문제로 보이지만, **지시서가 MODIFY 대상으로 지목한 `backend/socket/__tests__/gameSession.test.js`(밤·재판 terminal broadcast의 reveals 검증, ENDED 스냅샷 ack 검증)를 실제로 실행해 확인할 수 없었다.** 검증 요구사항 중 소켓 경로 부분은 미검증 상태다.
    
    코드나 테스트는 고치지 않았다 (worktree 무변경).
    
    TEST_RESULT: FAIL

## Counts
passed n/a   failed n/a   skipped n/a

full log: (not written)
last commit: b09fbee slice(20260822-joker-game-result-reveal): implement
