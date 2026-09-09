# UI-16 신버전 UI 전체 흐름 실제 브라우저 회귀 검증

- 상태: **미검증 전체** (실제 브라우저 조작 불가 — 아래 "왜 미검증인가" 참고). 통과로 표기된 항목은 없다.
- 확인자: Claude (자동화 에이전트, pluto 슬라이스 AK 실행), 2026-09-09. 최초 작성 후 검토에서
  AC-01·AC-02가 partial로 반려되어 같은 날 재확인·보강했다(아래 "2차 확인에서 다시 검증한 것"
  참고).
- 결함 발견: 없음. 실행 자체를 하지 못했으므로 "결함 없음 확인"이 아니라 "결함 유무를 판단할 수 없음"이다.

## 왜 미검증인가

이 슬라이스가 요구하는 검증(로그인 → 로비 → 방 생성/참가 → 게임 진행 → 결과 화면 → 로비 복귀를
실제 브라우저에서 여러 계정으로 수행하고 각 단계 스크린샷을 남기는 것)을 수행하려면 다음이 모두
필요하다.

1. 브라우저를 열고 페이지를 클릭·입력하고 화면을 캡처할 수 있는 도구
2. 서로 다른 계정으로 로그인한 독립된 브라우저 세션 최소 2~3개(최소 인원 판 기준)
3. 기동된 백엔드(Node/Express + Socket.IO)와 MySQL DB

(1)은 이번 실행 환경에 제공되지 않는다. 최초 작성 시점과 이번 재확인 시점 두 번 모두 독립적으로
직접 확인했다.

- `ToolSearch`를 여러 쿼리로 실행("browser automation playwright puppeteer screenshot click
  navigate", "computer use screen capture UI interaction", "playwright", "visual regression
  image capture render page") — 브라우저를 열거나 클릭·캡처하는 도구는 한 번도 매칭되지 않았다.
- `where.exe chromium-cli` → `Could not find files for the given pattern(s).`(설치되어 있지
  않음. `run` 스킬이 권장하는 기본 드라이버지만 이 환경엔 없다).
- `where.exe chrome.exe` → 역시 `Could not find files for the given pattern(s).`(로컬에 이미
  깔린 Chrome/Chromium 바이너리도 없어 puppeteer-core 같은 "기존 브라우저에 붙는" 우회로도
  불가능하다).
- `where.exe npx` → `C:\Program Files\nodejs\npx(.cmd)`는 존재한다. 다만 `npx playwright
  install`로 브라우저를 새로 내려받는 것은 (a) `package.json`·lockfile을 건드리지 않고도 가능은
  하지만 (b) 아래에서 확인한 것처럼 이 세션은 `docker`·`Get-Command` 같은 한두 단어짜리 명령조차
  승인 대기로 막혀 실제로 실행할 수 없었다(다운로드 시도 자체가 이 승인 벽에 걸린다).

이는 DB나 서버가 기동에 실패한 경우와 같은 종류의 차단 사유이며(AC-04가 예정한 상황), 실제로는
그보다 더 이전 단계에서 막힌다 — 서버·DB가 정상 기동하더라도 그 화면을 조작·캡처할 방법이 없다.

부수적으로, 이 실행 환경의 셸도 각 명령마다 개별 승인이 필요한 샌드박스로 동작한다. 이번
재확인에서 직접 재현한 사례:

- `Get-Command chromium-cli -ErrorAction SilentlyContinue` →
  `This PowerShell command contains multiple operations. The following part requires approval:
  Get-Command chromium-cli -ErrorAction SilentlyContinue`
- `docker info` (인자 없는 단어 두 개짜리 명령) →
  `This PowerShell command contains multiple operations. The following part requires approval:
  docker info`
- 반면 `echo hello`, `where.exe chromium-cli` 같은 단순 조회 명령은 즉시 실행됐다 — 즉 셸 자체가
  전면 차단된 것이 아니라, `docker`·`Get-Command`처럼 폭넓은 부작용을 낼 수 있는 명령군이
  선택적으로 승인 게이트에 걸리는 구조다. 이 승인은 사람이 실시간으로 지켜보며 눌러줄 때만
  풀리는데, 이 슬라이스는 사람 개입 없이 자동 실행되는 파이프라인이라 그 승인을 받을 방법이
  없다. 따라서 `docker compose up`으로 DB·백엔드·프론트를 띄우는 것부터 이미 이 실행 모델에서는
  구조적으로 막혀 있다 — 이는 "이번에 더 열심히 시도하면 뚫리는" 종류의 제약이 아니라, 이
  자동화 슬라이스 실행기 자체가 브라우저 회귀 검증에 필요한 대화형 승인·화면 캡처 능력을
  갖추지 않았다는 뜻이다.

**따라서 AC-01~AC-04가 요구하는 모든 단계는 "결함 없음"이 아니라 "미검증"으로 기록한다.**
이는 통과를 주장하지 않기 위한 것이며, AC-04가 명시한 원칙(DB/서버 기동 실패 등으로 검증하지
못한 단계는 통과로 표기하지 않는다)을 도구 부재 상황에도 동일하게 적용한 것이다.

## 2차 확인에서 다시 검증한 것 (검토 반려 대응)

최초 제출이 AC-01·AC-02에서 partial로 반려됐다. 반려 사유와 이번에 한 일:

- AC-01 반려 사유: "모든 스크린샷이 없고 보관 경로에도 README.md만 추가되었다." → 스크린샷이
  없다는 사실 자체는 위에서 다시 확인한 것처럼 이번에도 바뀌지 않는다(도구가 여전히 없다).
  대신 이번에는 (a) 도구 부재 주장을 재현 가능한 명령·오류 문자열로 다시 검증했고, (b) 아래
  "판 식별자(방코드) 연결 프로토콜" 절에서 실제로 존재하는 방코드 UI(`RoomCodeViewModal`,
  `matchingStore.roomCode`)를 근거로 스크린샷 파일명·기록 규칙을 구체화해, 다음에 실제로
  브라우저 도구가 주어졌을 때 이 문서만 보고 바로 스크린샷을 채울 수 있도록 했다. 실행하지
  못한 것을 실행한 것처럼 꾸미지는 않는다 — 파일 자체는 여전히 비어 있다.
- AC-02 반려 사유: "QA3·QA4 미검증 항목은 함께 있으나, 동일 판에서 실제 확인한 결과와 이를
  연결할 판 식별 근거가 없다." → 이전 버전은 QA3·QA4를 "같은 표 안에 나란히 적었다"는 것만으로
  동일 판 항목이라고 주장했을 뿐, 실제로 같은 판임을 증명할 식별자가 없었다. 이번에 코드를
  확인해 실제로 존재하는 식별자 두 가지를 찾았다:
  - `matchingStore.js:15,30`의 `roomCode`(6자 영숫자, 방 생성/입장 시 서버가 내려주고
    `RoomCodeViewModal`이 화면에 표시·복사 가능하게 한다) — 로비~매칭 단계의 판 식별자.
  - 서버가 게임 시작 시 발급하는 `gameId`(`useInGameStore`가 보관, `useInGameSessionSnapshotSync`
    등이 참조) — 게임 진행 중 단계의 판 식별자. 로비 단계의 `roomCode`와 게임 진행 단계의
    `gameId`는 같은 매칭 성사에서 이어지는 한 쌍이지만 서로 다른 값이므로, 문서에는 두 값을
    모두 기록하도록 칸을 만들었다.
  아래 표들에 "판 식별자" 열을 추가해, 실제 실행 시 두 값을 반드시 채우도록 구조를 바꿨다.
  값을 지어내지 않았으므로 현재는 모두 "(미실행)"으로 비어 있다 — 이 열이 존재한다는 것 자체가
  다음 실행자에게 "동일 판임을 증명하려면 이 두 값을 캡처해 기록하라"는 강제 조건이 된다.

### 실제로 확인/수행한 것

- `frontend/node_modules`, `backend/node_modules`가 비어 있어(설치되지 않음) 자동 테스트조차
  실행할 수 없는 상태였다. 각 lockfile 기준으로 `npm ci --prefix frontend`,
  `npm ci --prefix backend`를 실행해 설치했다(`package.json`·lockfile 자체는 건드리지 않음,
  `node_modules`는 git 추적 대상이 아니라 `git status`에 나타나지 않는다).
- 설치 후 AC-06이 요구하는 세 명령을 모두 전경에서 끝까지 실행해 통과를 확인했다(아래 "자동
  검증(AC-06) 결과" 참고).
- `docker-compose.yml`을 읽어 백엔드가 MySQL 8.4에 의존함을 확인했다(루트 `.env`는 없고
  `backend/.env.test`만 존재 — 즉 로컬 dev용 DB 자격 증명도 별도로 준비되어 있지 않다). 이
  환경에서 dev DB/서버를 실제로 띄우는 시도는 어차피 (1)의 브라우저 조작 도구 부재로 결과를
  검증할 수 없으므로 진행하지 않았다.
- 직전 슬라이스들(UI-13/UI-14, `docs/qa/2026-09-09-ui-13-timebar-page-visual.md`,
  `docs/qa/2026-09-09-ui-14-overlays-visual.md`)이 동일하게 "브라우저 환경 없음 → UI-16에서
  수행" 상태로 남겨 놓았던 항목들도 이번에 함께 수행하지 못했다. 이 두 문서가 미룬 검증 부담은
  이 문서로 넘어오지만, 이 문서 역시 해소하지 못했다.

## 판 식별자(방코드·gameId) 연결 프로토콜

AC-02가 지적한 "동일 판임을 증명할 식별자"는 코드에 이미 존재하는 두 값을 그대로 쓰면 된다 —
새로 설계할 필요가 없다.

- **방코드(6자 영숫자)**: 방 생성/참가 시 서버가 내려주고 `matchingStore.js`(`roomCode` 필드,
  15·30행)가 보관하며, `RoomCodeViewModal.jsx`(`frontend/src/domains/game/matching/components/
  RoomCodeViewModal.jsx:69`, "방코드 보기" 팝업)와 `RoomInvitePage`가 화면에 6칸으로 표시하고
  복사 버튼도 제공한다. 로비~매칭 단계 스크린샷은 이 화면이 함께 찍히므로 방코드가 스크린샷
  자체에 이미 보인다.
- **gameId**: 매칭이 성사되어 게임이 시작되면 서버가 발급하고 `useInGameStore`가 보관한다
  (`useInGameSessionSnapshotSync`가 `gameId`를 읽어 스냅샷을 요청하는 것이 그 사용례,
  `frontend/src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js:18`). 이 값은 현재
  화면에 상시 노출되지 않으므로, 실행자는 개발자 도구 콘솔이나 소켓 이벤트 로그로 값을 직접
  확인해 문서에 옮겨 적어야 한다.

**규칙**: 아래 두 표를 채울 때는 각 행에 그 순간의 방코드 또는 gameId(어느 쪽이 그 단계에서
의미 있는 식별자인지에 따라)를 반드시 함께 적는다. 로비 단계(1~3번)는 방코드로, 게임 진입
이후(4번~)는 gameId로 식별한다. QA3·QA4 두 행은 반드시 **같은 gameId**를 적어야 "동일 판"이라는
주장이 성립한다 — 서로 다른 gameId가 적히면 그 자체로 이 문서의 AC-02 요구를 충족하지 못한
것이다. 스크린샷 파일명도 `<단계번호>-<계정>-<방코드 또는 gameId>.png` 형식으로 식별자를
포함시켜, 스크린샷 파일 자체만 보고도 어느 판에 속하는지 추적 가능하게 한다.

이번 실행에서는 실제로 방을 만들거나 게임을 진행하지 못했으므로 두 값 모두 확보하지 못했다.
아래 표의 "판 식별자" 열은 그래서 전부 "(미실행)"이다 — 값을 지어내는 대신 빈칸으로 남기고,
다음 실행자가 반드시 채워야 하는 필수 칸이라는 것만 구조로 못박아 둔다.

## 단계별 결과 (모두 미검증)

| # | 단계 | 판 식별자 | 스크린샷 | 결과 | 사유 |
| --- | --- | --- | --- | --- | --- |
| 1 | 로그인 | (미실행) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 2 | 로비 진입 | (미실행) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 3 | 방 생성/참가(최소 인원, 방코드 필수 기록) | (미실행 — 방코드) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 4 | 게임 시작 → 역할 공개(ROLE_REVEAL, gameId 필수 기록) | (미실행 — gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 5 | 1일차 낮 토론(DAY_DISCUSSION) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 6 | 1일차 낮 투표(DAY_VOTE) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 7 | 재판(TRIBUNAL, 회부된 경우) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 8 | 밤 역할 턴 안내·밤 행동 제출(NIGHT) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 9 | 밤 판정·사망 연출(killReveal) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 10 | 밤 개인 결과(nightPrivateResult) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 11 | 2일차 낮 진입 | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 12 | 게임 종료 → 결과 화면(ENDED) | (미실행 — 4번과 동일 gameId) | 없음 | 미검증 | 브라우저 조작 도구 없음 |
| 13 | 결과 화면 → 로비 복귀 | (미실행) | 없음 | 미검증 | 브라우저 조작 도구 없음 |

## 동일 판 내 QA3·QA4 확인 (미검증)

AC-02가 요구하는 대로 아래 두 항목은 위 표의 같은 한 판(3~11단계) 안에서, **같은 gameId**로
함께 확인되어야 하는 항목이다. 실행하지 못했으므로 둘 다 미검증으로 기록하고, 판 식별자 칸도
비워 둔다 — 두 행에 실제로 같은 gameId가 채워질 때만 AC-02가 요구하는 "동일 판 식별 근거"가
성립한다.

| 항목 | 확인 내용 | 판 식별자(gameId) | 결과 | 사유 |
| --- | --- | --- | --- | --- |
| QA3 | 새로고침 후 세션 복구 — 진행 중인 판(예: 밤 또는 2일차 낮)에서 브라우저를 새로고침했을 때 `get_session_snapshot`으로 현재 phase까지 상태가 원자적으로 복원되는지(`useInGameSessionSnapshotSync`, `frontend/src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js:16`) | (미실행) | 미검증 | 브라우저 조작 도구 없음 |
| QA4 | 생존 self는 낮 투표·낮 준비·밤 행동 조작이 가능하고, 사망 self는 같은 컨트롤이 잠겨 있는지(`resolveInGameSelfAliveForControls`, `frontend/src/domains/game/ingame/utils/selectInGameSelfAlive.js:44`가 `useInGameActionPanel`의 게이트 판정원) | (미실행 — QA3과 동일해야 함) | 미검증 | 브라우저 조작 도구 없음 |

QA3·QA4에 관련된 자동 테스트(node:test, jsdom 기반 훅 렌더 테스트)는 이번에 실행한 AC-06 검증에
포함되어 통과했다 — 예: `useInGameActionPanel.canonicalAlive.test.js`
(`canonical alive=true면 낮 투표 UI가 활성화된다`, `canonical alive=false면 세션 컨텍스트가
생존이라고 말해도 낮 투표 UI가 비활성화된다` 등), `useInGameSessionSnapshotSync.test.js`(정상
ack 원자적 복원, stale 응답 거부 등). 다만 이는 코드 단위의 자동 검증이며, 이 문서가 요구하는
"실제 브라우저에서 여러 계정으로 관찰"과는 다른 종류의 증거다 — AC-01~04는 자동 테스트 통과로
대체할 수 없다.

## 결함 기록

없음. 실행하지 못했으므로 결함을 발견할 기회 자체가 없었다. "결함이 없다"는 결론이 아니라
"결함 유무를 이 문서에서 판단할 수 없다"는 뜻이다.

## 자동 검증(AC-06) 결과

최초 제출 시 의존성이 설치되어 있지 않아(`frontend/node_modules`, `backend/node_modules` 없음)
`npm ci --prefix frontend`, `npm ci --prefix backend`로 각 lockfile 기준 설치를 먼저 마쳤다.
이번 2차 확인 시점에는 두 `node_modules`가 이미 설치되어 있어(직전 실행이 남긴 상태) 재설치
없이 아래 세 명령을 다시 전경에서 끝까지 실행해 재확인했다.

| 명령 | 결과 |
| --- | --- |
| `npm test --prefix frontend` | 통과 — tests 1164, pass 1164, fail 0 |
| `npm run build --prefix frontend` | 통과 — `vite build` 성공(dist 산출물 생성, chunk 크기 경고만 있음) |
| `npm run test:game-core --prefix backend` | 통과 — tests 481, pass 481, fail 0 |

이 결과는 코드 변경이 없는 상태(문서만 추가·수정)에서 기존 스위트가 정상 통과함을 확인한
것이며, 위 "단계별 결과"·"QA3·QA4"의 미검증 상태를 대체하지 않는다.

## 스크린샷 보관

- 위치: `docs/qa/ui-16-browser-regression/`
- 파일명 규칙: `<단계번호>-<계정 라벨>-<방코드 또는 gameId>.png` (예:
  `04-accountA-g_a1b2c3.png`). 계정 라벨은 QA3·QA4처럼 두 세션을 구분해야 하는 단계에서만
  붙이고, 단일 관찰로 충분한 단계는 생략해도 된다. 식별자를 파일명에 넣는 이유는 위 "판
  식별자(방코드·gameId) 연결 프로토콜" 절 참고 — 표와 파일 양쪽에서 같은 판임을 대조할 수
  있어야 한다.
- 이번 실행에서 실제로 수행한 단계가 없어 이 디렉터리에는 스크린샷 대신 사유를 적은
  `README.md`만 둔다. 이후 실제 브라우저 환경에서 재실행할 때 위 단계별 표의 각 행에 위 규칙을
  따르는 파일을 채우고, 표의 "판 식별자"·"결과" 칸을 실제 값과 통과/결함으로 갱신해야 한다.

## 재개에 필요한 것 (다음 시도를 위한 메모)

1. 브라우저를 열고 클릭·입력·캡처할 수 있는 도구(예: Playwright/Puppeteer 기반 MCP 도구 또는
   사람이 직접 수행) — 최초 작성 시점과 이번 2차 확인 시점 모두 이 세션에는 없었다(위 "왜
   미검증인가" 절의 재현 근거 참고). `chromium-cli`도, 로컬에 이미 설치된 Chrome/Chromium
   바이너리도 없어 우회할 방법이 없었다.
2. 로컬 dev DB 자격 증명(`backend/.env`는 없고 `.env.test`만 있음) 또는 `docker-compose.yml`
   기반 `db` 서비스 기동 — 이번 세션은 `docker info`처럼 단어 두 개짜리 명령조차 사람의 실시간
   승인을 요구하는데, 이 슬라이스는 무인 자동 실행이라 그 승인을 받을 수 없다(위에서 실제
   오류 메시지로 재확인). 이는 다음 시도에서도 셸 명령을 더 궁리한다고 풀리는 문제가 아니라,
   이 자동화 슬라이스 실행기 자체에 대화형 승인 경로가 있거나, 사람이 직접 이어받아야 풀린다.
3. 최소 인원 이상의 독립 로그인 세션 — 매칭 시작 인원 하한은 `GAME_DEV_MIN_PLAYERS`
   환경변수로 조절되며 기본값은 1이다(`backend/socket/matchmaking.js:57`,
   `const configured = Number(process.env.GAME_DEV_MIN_PLAYERS ?? 1)`). 다만 QA3(새로고침
   복구)·QA4(생존/사망 self 컨트롤 게이트)를 같은 판 안에서 관찰하려면 최소 1인 처형 또는 밤
   사망으로 사망 self가 실제로 발생해야 하므로, 매칭 인원 하한과는 별개로 실질적으로는 2~3인
   이상의 독립 세션이 필요하다(`docs/qa/day2-vote-alive-manual.md`가 10인 기준으로 이미 고정한
   시나리오를 최소 인원 버전으로 재현할 수 있다).
