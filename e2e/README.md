# E2E 멀티 클라이언트 10일차 시나리오

브라우저 컨텍스트 5개를 띄워 로그인 → 방장이 공개 방 생성 → 나머지 넷이 `/multiplay` 공개 방
목록에서 순서대로 클릭 입장 → 게임 시작 → 1일차 밤 사망 → 2~9일차 반복 → 10일차 재판 처형 →
결과 화면 → 5창 전원 로비 이탈까지 전체 플로우를 자동 재생한다.

| 구간 | 내용 | 생존 |
| --- | --- | --- |
| DAY 1 | 부트스트랩 — 전원 기권 | 5 |
| **NIGHT 1(치명)** | JOKER→CITIZEN 암살, DOCTOR→GUARD(빗나간 보호), GUARD 조사, **WH 턴 없음** | 5 |
| DAY 2 | 사망 영상 → DAY 진입 → 사망자 표시 → 생존 4인 기권 | 4 |
| **NIGHT 2~9** | JOKER→GUARD, DOCTOR→GUARD(보호 성공), GUARD 순환 조사, **WH→CITIZEN 시신 확인** | 4 |
| DAY 3~9 | 사망 영상 없음 → DAY 진입 → 생존 4인 기권 | 4 |
| **DAY 10** | 생존 비-JOKER 3인이 JOKER 지목 → 재판 유죄 3표 → 처형 → 시민 승리 | 4 |
| 종료 | 결과 페이지 검증 → 5창 전원(사망자 포함) "로비로" → `/multiplay` 도착 | — |

시신을 시나리오 맨 앞에서 만드는 이유는 아래 "마녀사냥꾼은 시신이 있는 밤에만 턴을 받는다"에 있다.

좌석(= 방 입장 순서)이 곧 역할이다.

| 좌석 | 계정 | 역할 |
| --- | --- | --- |
| S1 | `E2E_USER1_*` | JOKER |
| S2 | `E2E_USER2_*` | DOCTOR |
| S3 | `E2E_USER3_*` | GUARD |
| S4 | `E2E_USER4_*` | WITCH_HUNTER |
| S5 | `E2E_USER5_*` | CITIZEN |

---

## 실행 전제 (사람이 미리 갖춰야 한다)

이 스크립트는 서버를 대신 띄워주지 않는다(`playwright.config.js`에 `webServer`가 없다).
서버를 자동으로 띄우면 `DEBUG_FIXED_ROLES`가 빠진 채 조용히 랜덤 배정으로 도는 사고를
오히려 감추게 되기 때문이다.

### 1. backend에 결정적 역할 배정 플래그를 켠다

`backend/.env`에 다음 한 줄을 넣는다(`backend/.env.example:30`의 주석을 해제하면 된다).

```
DEBUG_FIXED_ROLES=JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN
```

### 2. backend + frontend dev 서버를 띄운다

저장소 루트에서:

```
npm run dev
```

### 3. 테스트 계정 5개를 미리 회원가입해 둔다

스크립트는 회원가입을 하지 않고 로그인만 한다. 닉네임 5개는 서로 달라야 한다 —
좌석을 닉네임으로 구분하기 때문이다.

### 4. `e2e/.env`를 만든다

```
cp e2e/.env.example e2e/.env      # PowerShell: Copy-Item e2e/.env.example e2e/.env
```

### 5. playwright를 설치한다

```
npm --prefix e2e install
npm --prefix e2e run install:browsers
```

### 6. 실행

```
npm --prefix e2e test          # 헤드리스
npm --prefix e2e run test:headed   # 창을 보면서
npm --prefix e2e run report        # 실패 후 HTML 리포트 열기
```

5창 × 19회 진입 연출 + 밤 9회 + 단계별 스크린샷을 순차로 재생하므로 **12~18분** 정도 걸린다.
테스트 타임아웃은 20분, 워커는 1개다(병렬 실행은 서로의 방을 망친다).
스크린샷 비용이 부담되면 `E2E_STEP_SHOTS=0`으로 끄면 된다.

---

## 반드시 알아야 하는 함정

### 방은 반드시 CUSTOM(직접 지정) 5인이어야 한다

5인 방을 **자동(AUTO)** 으로 만들면 특수 역할 budget이 전부 0이라
(`backend/game-core/roleComposition.js`의 `getSpecialRoleBudget`) 구성이 `JOKER 1 + CITIZEN 4`가
된다. 그러면 `DEBUG_FIXED_ROLES`의 역할별 개수가 그 구성과 맞지 않아
`COMPOSITION_MISMATCH` 경고 한 줄만 남기고 **조용히 랜덤 배정으로 되돌아간다**
(`resolveDebugFixedRoleAssignment`).

그래서 `lib/scenarioPlan.js`의 `ROOM_SETUP_PLAN`이 방 생성 화면을
`최대 플레이어 5` · `역할 구성 직접 지정` · `광대 1 · 의사 1 · 경비대 1 · 마녀사냥꾼 1`로
강제한다(시민 1명은 서버가 `5 - 4`로 파생한다). 이 순서를 바꾸면 안 된다 — 정원을 먼저 5로
줄여야 역할 스테퍼 범위가 5 기준으로 잡히고, CUSTOM으로 전환하는 순간 AUTO의 광대 수(2)가
승계되므로 광대 수 보정은 그 다음에 와야 한다.

역할이 어긋나면 "각 창에서 자기 역할 공개 문구 검증" 단계에서 즉시 실패한다.

### 방은 반드시 공개(open)여야 한다

나머지 좌석은 방코드가 아니라 `/multiplay`의 공개 방 목록에서 방을 클릭해 들어간다
(방코드 입력 화면은 아직 6자리 입력이 동작하지 않는다). 방 생성 화면의 **"코드로만 참가"** 를
켜면 `accessType`이 `"code"`가 되어(`buildCreateRoomPayload`) 이 경로가 양쪽에서 막힌다 —
목록의 입장 버튼이 `"코드 필요"`로 비활성되고(`RoomListShell`), 조작된 요청을 보내도 서버가
`room.accessType !== 'open'`으로 거부한다(`backend/socket/matchmaking.js`의
`handleJoinPublicRoom`).

그래서 `ROOM_SETUP_PLAN`은 이 체크박스를 **건드리지 않는다**(기본값이 꺼짐이다). 단위 테스트가
"체크박스 조작이 계획에 없다"를 고정한다.

목록 갱신은 폴링이 아니다. `/multiplay`에 들어가면 `usePublicRooms`가 마운트 즉시
`get_public_rooms`로 한 번 조회하고, 이후에는 서버의 `public_rooms_updated` 브로드캐스트로
갱신된다 — 그래서 새로고침 버튼 없이 "방 row가 나타날 때까지" 기다리기만 하면 된다.

방이 공개되는 대신, 테스트가 도는 동안 **같은 backend에 다른 사람이 붙어 있으면 안 된다**.
낯선 계정이 먼저 들어오면 좌석↔역할이 어긋나고 `confirmRoleReveal`이 첫 관문에서 실패한다.

### 게임의 첫 진행 단계는 밤이 아니라 낮이다

`ROLE_REVEAL(dayIndex 0) → DAY 1 → NIGHT 1 → DAY 2 → NIGHT 2 → …` 순서다
(`backend/game-core/gameSession.js`의 `enterDayPhase`). `dayIndex`는 NIGHT→DAY 전이에서만
1씩 오르고, DAY→NIGHT과 TRIBUNAL→NIGHT은 그대로 유지한다.

그래서 스크립트에는 요구서에 없던 **부트스트랩 DAY 1**(전원 기권) 단계가 있다. 첫 밤에
닿으려면 반드시 지나야 하는 구간이다.

### 마녀사냥꾼은 시신이 있는 밤에만 턴을 받는다

`isEligibleForNightAction`(`backend/game-core/gameSession.js`)이 `WITCH_HUNTER`에 대해서만
`hasAnyDeadPlayer(session)`를 그대로 반환한다. 사망은 밤의 판정(`commitNightResolution`)에서만
확정되므로 이 값은 곧 "그 밤 시작 시점에 시신이 있는가"다.

그래서 **1일차 밤에는 마녀사냥꾼 턴이 아예 오지 않는다.** 자격이 없으면
`getLivingNightTurnActorUuids`가 빈 배열이 되어 `computeCurrentNightTurnRole`이 그 역할을
건너뛰고, `night_turn_changed`에도 등장하지 않으며, `prepareNightResolution`도 그 제출을
기다리지 않는다 — 경호원이 제출하는 순간 서버가 곧바로 밤을 판정한다.

프런트는 이 판정에 참여하지 않는다. `NIGHT_ACTION_MIN_DAY_INDEX.WITCH_HUNTER`는 0이라
`getInGameNightActionType("WITCH_HUNTER", 1)`은 언제나 `"CONFIRM"`이고, 따라서 시신이 없는
밤에도 `"이 밤에는 행동할 수 없습니다."`는 **뜨지 않는다**(그 문구는 `nightActionType === null`
분기 전용이라 이제 CITIZEN에게만 해당한다). 대신 `nightActionControlsEnabled`가
`isNightActionTurn`을 요구하므로 `"확인 확정"`·`"건너뛰기"`가 그 밤 내내 비활성으로 남는다.

그래서 e2e는 `witchHunterCanActOn()`을 프런트에 위임하지 않고 **자기 시나리오의 시신
타임라인**(`deadSeatsAtNight`)으로 직접 판정한다. 관측 검증도 세 갈래다.

1. `"마녀사냥꾼의 시간입니다"` 안내가 그 밤에 한 번도 뜨지 않는다.
2. `"확인 확정"`·`"건너뛰기"`가 끝까지 비활성이다.
3. 마녀사냥꾼이 아무것도 제출하지 않았는데 밤이 판정되어 DAY로 넘어간다 — 자격이 있었다면
   서버가 그 제출을 기다리느라 밤이 영영 끝나지 않았을 것이다.

①②는 `assertNightTurnAbsent`가 **밤 진입 직후**와 **의사 제출 직후**(경호원 턴이 열린 시점)
두 번 확인한다. 경호원 제출 뒤에는 두지 않는다 — 서버 자동 판정과 경쟁하기 때문이다.

### 마녀사냥꾼 대상 목록에는 생존자도 보인다(잠겨 있을 뿐)

`buildNightActionTargets`의 `deadTargetsOnly` 분기는 생존자를 목록에서 **지우지 않고**
`selectable:false`로만 잠근다(시신이 없는 밤에 목록이 통째로 비어 "패널이 고장난 것처럼"
보이지 않게 하기 위해서다). `InGameTargetPicker`가 그 값을 그대로 `disabled`로 만든다.

그래서 요구서의 "대상 목록에 사망자만 나타나는지"는 `assertNightActionTargets`가
**"고를 수 있는 대상은 시신뿐이고, 생존자는 목록에 있되 전부 비활성"** 으로 검증한다.
picker 전체가 `nightActionControlsEnabled`로 잠기므로 이 검증은 **그 좌석의 턴이 열린 뒤**에만
참이다 — 밤 2~9에서 마녀사냥꾼은 마지막 제출자이므로 경호원 제출 직후가 유일하게 옳은 시점이다.

반대 방향도 성립한다. 경호원 등 다른 역할에게는 **시신이 잠긴다**. 그래서
`GUARD_INVESTIGATION_POOL`에서 `CITIZEN`을 뺐다 — 1일차 이후 그 버튼은 클릭 자체가 불가능하다.

### 밤 확인 문구의 CITIZEN은 "시민", 결과 페이지는 "귀족"

같은 역할인데 화면마다 어휘가 다르다. 밤 개인 결과 오버레이는
`ingameRoleRevealData.js`의 `CITIZEN → "시민"`을 쓰고(`reduceInGameNightPrivateResult`),
결과 페이지는 `buildGameResultViewModel.js`의 `CITIZEN → "귀족"`을 쓴다. 두 사전이 서로를
재사용하지 않는 것이 프로덕션의 명시적 결정이다.

그래서 시신 확인 문구 검증은 `"… 님의 역할은 시민입니다"`이고, `"귀족"`은 결과 페이지의
역할 목록(`RESULT_JOB_LABELS`)에서 검증된다. 둘 다 시나리오에 남아 있다.

### 결과 화면의 "로비로"는 `/lobby`가 아니라 `/multiplay`로 간다

`GameResultPage`의 `label="로비로"` → `useGameResultLobbyExit` → `createSessionEndFinalizer`가
`navigate("/multiplay")`로 끝난다. leave ack의 성패와 무관하게 언제나 같은 경로다.

시나리오 마지막에 **사망 좌석을 포함한 5창 전부**가 이 버튼을 눌러 명시적으로 이탈한다 —
연속 실행에서 세션이 남아 다음 재생의 좌석↔역할을 어긋나게 만들지 않기 위해서다.

### soft-assert · 단계 스크린샷 · 실패 요약

검증의 강도는 두 종류다.

| 종류 | 예 | 실패하면 |
| --- | --- | --- |
| 진행 동작 | `submitNightAction` · `dayVote` · `resolveDayVote` · `settleOverlays` · `waitForPhase` | 그 자리에서 즉시 중단 |
| 관측 검증 | 패널 문구 · 턴 부재 · 대상 목록 · 사망 표시 | `actors.softly`가 기록만 하고 계속 |

진행이 어긋난 뒤의 관측은 전부 무의미해서 요약이 잡음으로 가득 차므로, `softly`는 **관측
전용**이다. 수집된 실패는 `lib/failureLog.js`가 모아 두었다가 시나리오 맨 끝에서 요약 한 건으로
던진다(창 정리는 `finally`에 있어 그 throw와 무관하게 실행된다).

단계마다 5창의 화면을 `actors.captureStep`이 test output 디렉터리에 남긴다. `playwright.config`의
`screenshot: "only-on-failure"`와 역할이 다르다 — 그쪽은 실패한 순간 하나이고 이쪽은 통과한
단계들의 진행 기록이다. 부담되면 `E2E_STEP_SHOTS=0`으로 끈다. 그래도 느리면 다음 조정 지점은
"그 단계의 주인공 좌석만 찍기"다.

### 마지막 낮의 "생존 전원이 JOKER 투표"는 JOKER 본인에게 불가능하다

서버가 자기 자신 지목을 `SELF_TARGET_NOT_ALLOWED`로 거부하고 UI 목록에도 자기 자신이 없다.
그래서 비-JOKER 3명이 JOKER를 지목하고 JOKER는 기권한다 — 집계 결과는 의도대로
`TRIBUNAL`이고 대상은 JOKER다.

### 밤은 자동으로 판정되고, 낮·재판은 버튼을 눌러야 한다

마지막 역할까지 밤 행동을 제출하면 서버가 client `resolve_night` 없이 곧바로 판정한다.
반면 `"낮 집계"`와 `"재판 판정"`은 창 하나가 눌러야 진행된다.

---

## 파일 구성

| 경로 | 역할 |
| --- | --- |
| `playwright.config.js` | 단일 워커·20분 타임아웃·baseURL·자동재생 허용 |
| `lib/env.js` | `.env` 파싱과 좌석별 계정 해석 (순수) |
| `lib/scenarioPlan.js` | 방 설정 조작·10일 밤낮 계획·시신 타임라인·기대 문구 (순수) |
| `lib/failureLog.js` | soft-assert 실패 수집기와 종료 요약 포매터 (순수) |
| `lib/selectors.js` | data 훅 이름 → CSS 셀렉터, 공개 방 row 이름 패턴 (순수) |
| `lib/actors.js` | 좌석 page object — 로그인·방·오버레이 정리·행동 제출·단계 스크린샷 |
| `tests/tenDayScenario.spec.js` | 시나리오 본문 |

기대 문구는 절대 복사하지 않는다. `lib/scenarioPlan.js`가 프런트엔드의 프로덕션 빌더
(`reduceInGameNightPrivateResult` · `buildInGameKillRevealMessage` ·
`getInGameRoleRevealDisplay` · `getInGameNightActionLabel`)를 그대로 import해 기대값을 만든다 —
화면 문구를 바꾸면 이 스크립트의 기대값도 같이 바뀌므로 드리프트가 생기지 않는다.

셀렉터도 마찬가지로 프런트가 소유한 단일 원천
(`frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js`)에서만 속성 이름을 읽는다.

예외는 공개 방 제목(`{닉네임}의 방`) 하나뿐이다. 이 형식은 backend(`socket/matchmaking.js`)가
만들어 import할 프런트 원천이 없으므로 `lib/selectors.js`의 `publicRoomTitle` 한 곳에만
문자열로 적어두고, 출처 경로를 주석으로 고정해 두었다.

## 헬퍼 단위 테스트 (playwright 없이 돈다)

```
npm --prefix e2e run test:helpers
# 또는 저장소 루트에서
npm run test:e2e-helpers
```

`lib/env.js` · `lib/scenarioPlan.js` · `lib/selectors.js` · `lib/failureLog.js`는 순수 함수라
브라우저 설치 없이 `node --test`로 그대로 검증된다. 순환 조사 대상·생존자 기준 투표 계획·
기대 문구·마녀사냥꾼의 시신 규칙·실패 요약 포맷이 여기서 고정된다.
