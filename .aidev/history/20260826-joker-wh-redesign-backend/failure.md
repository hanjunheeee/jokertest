# FAILURE - 20260826-joker-wh-redesign-backend · verify attempt 1
2026-08-26T20:24:21+09:00

## Command
    (the test stage's own report)                      exit 1   0.0s

## Output (tail 60 lines)
The runner's output could not be summarised, so it is quoted as it came.

    
    (출력이 30k자 제한에 잘려 실패 목록 확인용으로 `npm test --prefix backend -- --test-reporter=dot`, 그리고 개별 파일 재현용으로 `npm test --prefix backend -- socket/__tests__/<file>.test.js`도 실행했다. 스크립트 본체는 동일하다.)
    
    ### 결과
    
    - exit code **1**
    - dot 리포터 기준 **392개 중 387 pass / 5 fail**
    - 실패한 것은 `backend/socket/__tests__/` 아래 **테스트 파일 5개 전부**이며, 개별 테스트 실패가 아니라 **파일 로드 단계에서 죽는다**.
    
    ```
    ✖ socket\__tests__\gameSession.test.js (144.8399ms)          'test failed'
    ✖ socket\__tests__\matchmaking.test.js (132.9548ms)          'test failed'
    ✖ socket\__tests__\nightTurnProgression.test.js (139.034ms)  'test failed'
    ✖ socket\__tests__\publicRooms.test.js (122.9576ms)          'test failed'
    ✖ socket\__tests__\socket.test.js (107.6181ms)               'test failed'
    ```
    
    ### 각 실패의 에러
    
    4개 파일(`gameSession` / `matchmaking` / `nightTurnProgression` / `publicRooms`):
    
    ```
    Error: Cannot find module 'sequelize'
    Require stack:
    - backend\models\index.js
    - backend\repositories\user.repositories.js
    - backend\socket\matchmaking.js
    - backend\socket\gameSession.js
    - backend\socket\__tests__\nightTurnProgression.test.js
      code: 'MODULE_NOT_FOUND'
    ```
    
    `socket.test.js`:
    
    ```
    Error: Cannot find module 'socket.io'
    Require stack:
    - backend\socket\socket.js
    - backend\socket\__tests__\socket.test.js
      code: 'MODULE_NOT_FOUND'
    ```
    
    ### 원인과 차단 지점
    
    이 워크트리에는 `node_modules`가 어디에도 존재하지 않는다 (`backend/`, 루트, `frontend/`, `e2e/` 모두 없음). 의존성을 설치하려고 시도했으나 거부되었다 — 명령과 응답 그대로:
    
    - 명령: `npm install --prefix backend --no-audit --no-fund`
    - 응답: `This command requires approval`
    
    사전 승인 목록에 설치 명령이 없어 진행할 수 없었다. 따라서 socket 계층 테스트는 **실행 자체가 불가능**했고, 통과했다고 보고할 수 없다.
    
    ### 통과한 부분
    
    `game-core/__tests__/*` 와 `utils/__tests__/*` 는 외부 의존성을 요구하지 않아 전부 실행되었고 실패가 없었다. 이번 슬라이스가 추가/갱신한 game-core 테스트도 그 안에 포함되어 통과했다 (예: `ROLE_DEFINITIONS: nightActionMinDayIndex는 밤 행동 유무(null=없음)와 dayIndex 하한만 나타낸다`, `prepareNightResolution: 사망자가 있는 밤에는 WITCH_HUNTER의 개인 결과가 {actionType:CONFIRM, targetId, role}로 담긴다`).
    
    다만 계획 4절이 요구사항 2의 핵심 증거로 지정한 `backend/socket/__tests__/nightTurnProgression.test.js`(턴 스킵·등장·production 경로 INVALID_TARGET 거부)는 **한 줄도 실행되지 못했다**. 요구사항의 "기존 backend 전체 테스트 PASS" 검증 항목은 충족되지 않았다.
    
    코드나 테스트는 수정하지 않았다.
    
    TEST_RESULT: FAIL

## Counts
passed n/a   failed n/a   skipped n/a

full log: (not written)
last commit: fb95e6f slice(20260826-joker-wh-redesign-backend): implement
