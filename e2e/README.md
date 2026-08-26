# E2E 멀티 클라이언트 10일차 시나리오

브라우저 컨텍스트 5개를 띄워 로그인 → 방 생성·전원 입장 → 게임 시작 → 1~9일차 반복 →
10일차 사망 → 재판 처형 → 결과 화면까지 전체 플로우를 자동 재생한다.

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

5창 × 21회 진입 연출 + 밤 10회를 순차로 재생하므로 **10~15분** 정도 걸린다.
테스트 타임아웃은 15분, 워커는 1개다(병렬 실행은 서로의 방을 망친다).

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

### 게임의 첫 진행 단계는 밤이 아니라 낮이다

`ROLE_REVEAL(dayIndex 0) → DAY 1 → NIGHT 1 → DAY 2 → NIGHT 2 → …` 순서다
(`backend/game-core/gameSession.js`의 `enterDayPhase`). `dayIndex`는 NIGHT→DAY 전이에서만
1씩 오르고, DAY→NIGHT과 TRIBUNAL→NIGHT은 그대로 유지한다.

그래서 스크립트에는 요구서에 없던 **부트스트랩 DAY 1**(전원 기권) 단계가 있다. 첫 밤에
닿으려면 반드시 지나야 하는 구간이다.

### 마녀사냥꾼의 day0 스킵 분기는 현재 배포 흐름에서 밟히지 않는다

`WITCH_HUNTER.nightActionMinDayIndex = 1`인데 첫 밤이 이미 `NIGHT dayIndex 1`이므로,
마녀사냥꾼은 **첫 밤부터 행동할 수 있다**. `dayIndex 0`인 NIGHT은 백엔드 유닛 테스트가
세션을 직접 조립할 때만 존재한다.

스크립트는 스킵 여부를 하드코딩하지 않고 화면에서 읽은 canonical dayIndex를
`witchHunterCanActOn()`에 넣어 그 밤에 "확인" 패널을 기대할지
`"이 밤에는 행동할 수 없습니다."`를 기대할지 정한다 — 흐름이 어느 쪽이든 스크립트는 옳다.
스킵 분기 자체는 `witchHunterCanActOn(0) === false` 단위 테스트로 고정돼 있다.

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
| `playwright.config.js` | 단일 워커·15분 타임아웃·baseURL·자동재생 허용 |
| `lib/env.js` | `.env` 파싱과 좌석별 계정 해석 (순수) |
| `lib/scenarioPlan.js` | 방 설정 조작·10일 밤낮 계획·기대 문구 (순수) |
| `lib/selectors.js` | data 훅 이름 → CSS 셀렉터 (순수) |
| `lib/actors.js` | 좌석 page object — 로그인·방·오버레이 정리·행동 제출 |
| `tests/tenDayScenario.spec.js` | 시나리오 본문 |

기대 문구는 절대 복사하지 않는다. `lib/scenarioPlan.js`가 프런트엔드의 프로덕션 빌더
(`reduceInGameNightPrivateResult` · `buildInGameKillRevealMessage` ·
`getInGameRoleRevealDisplay` · `getInGameNightActionLabel`)를 그대로 import해 기대값을 만든다 —
화면 문구를 바꾸면 이 스크립트의 기대값도 같이 바뀌므로 드리프트가 생기지 않는다.

셀렉터도 마찬가지로 프런트가 소유한 단일 원천
(`frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js`)에서만 속성 이름을 읽는다.

## 헬퍼 단위 테스트 (playwright 없이 돈다)

```
npm --prefix e2e run test:helpers
# 또는 저장소 루트에서
npm run test:e2e-helpers
```

`lib/env.js` · `lib/scenarioPlan.js` · `lib/selectors.js`는 순수 함수라 브라우저 설치 없이
`node --test`로 그대로 검증된다. 순환 조사 대상·투표 계획·기대 문구·마녀사냥꾼 min-day가
여기서 고정된다.
