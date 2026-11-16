# 브라우저 시험 (Playwright)

이 글은 진짜 브라우저로 누르는 시험(브라우저 시험)을 어디에 쓰고, 어떻게 돌리고, 어떤 도우미가 있는지 보여 줌.

- 시험 전용 DB·포트로 따로 돎 → 개발 서버(4000·5173·5174)·개발 DB와 안 부딪힘
- 기준: 브랜치 `fix/scenario-2026-11-16`, 2026-11-16 낮
- 시험을 **쓰는 규칙**(번호·5명 판·표시·"보임" 확인)은 `docs/게임_의도_2026-11-15/시험_도우미.md`와 `_시험_공통.md`가 정본, 이 글은 폴더 안내

## 1. 한눈에

이 표는 시험이 쓰는 DB·주소·파일 자리를 보여 줌.

| 것 | 값 |
|---|---|
| 시험 DB | docker `jokertest-db-1` 안 `joker_e2e` (계정 `mmc_e2e`, 이 DB만 권한) |
| 백엔드 | `http://localhost:4100` (`scripts/start-backend.js`가 켬, 꺼지면 다시 켬) |
| PC 화면 | `http://localhost:5273` (`scripts/serve-front.js desktop`) |
| 모바일 화면 | `http://localhost:5274` (`scripts/serve-front.js mobile`) |
| 관리자 화면 | `http://localhost:5275` (`scripts/serve-front.js admin`, `/admin-api`는 4100으로 넘김) |
| 비밀값 | `e2e/.env.e2e` (git에 안 올라감, 처음 `npm run db:setup`이 무작위로 만듦) |
| 서버 로그 | `e2e/.runtime/backend.log` (SQL까지 다 있음) |
| 받은 메일 | `e2e/.runtime/mail/<주소>.jsonl` (진짜 메일 안 나감) |
| 결과 | `reports/html`(`npm run report`), `reports/results.json`, 실패 사진·trace(실행 기록)는 `test-results/<실행 번호>/` |

## 2. 돌리는 법

이 장은 명령을 적음. **브라우저 시험은 고치기·부하가 끝난 뒤 한 번만 돌림** — 쓰는 동안에는 모이는지만 봄.

```bash
cd e2e
npm install                 # @playwright/test 1.62.1 (브라우저가 없으면 npx playwright install chromium webkit)
npm run db:setup            # 시험 DB 만들기 + 마이그레이션(DB 표 바꾸기) 34개 + 시험 상품 (다시 돌려도 됨)

# 쓰는 동안: 돌리지 않고 모이는지·개수만
npx playwright test --list --no-deps tests/ingame/a05-x.spec.js
node --check tests/ingame/a05-x.spec.js          # 이 폴더엔 eslint 설정이 없음

# 한 번 돌릴 때: 단계별로 (CPU 보고 작업자 수 정함, 실패 파일만 한 번 다시)
bash ../tools/시험도구/br/all.sh
```

- 서버 넷(백엔드·PC·모바일·관리자 화면)은 Playwright가 켜고 끝나면 끔. 켜 둔 것을 쓰려면 `E2E_REUSE=1`
- 한 폴더만: `npx playwright test --no-deps tests/room` · 한 프로젝트만: `--project=mobile`
  - `--no-deps`를 꼭 붙임: serial 프로젝트가 앞 프로젝트를 먼저 돌리게 묶여 있어, 안 붙이면 파일 거르기가 앞 프로젝트에 안 먹고 전부 돎
  - serial 시험(서버 끄기·점검)은 `--project=serial --no-deps`로 따로 (`npm run test:shutdown`)
- 판 시험 빼고: `npm run test:fast` · 판 시험만: `npm run test:game` · 사파리만: `npm run test:safari`
- 시험 DB 새로: `npm run db:reset`

### 바꿀 수 있는 값 (환경값)

| 값 | 기본 | 무엇 |
|---|---|---|
| `E2E_WORKERS` | `6` | 동시에 도는 작업자 수 (8까지 확인함) |
| `E2E_REUSE=1` | 꺼짐 | 켜 둔 서버(4100·5273·5274·5275)를 그대로 씀 |
| `E2E_NODES` | `1` | 서버 수. `2`면 4100은 앞단(프록시), 4101·4102에 서버 둘 + 시험 Redis(6380) → `tests/multinode/**`도 돎 |
| `E2E_LB` · `E2E_PROXY` · `E2E_REDIS_URL` | `rr` · `node` · `redis://127.0.0.1:6380` | 서버 여러 대일 때 나누는 법(`rr`·`least`), 앞단 종류(`node`·`nginx`), 시험 Redis 주소 |
| `E2E_FRONT` | `build` | 화면 서버: `build` = 빌드본 + 작은 정적 서버, `dev` = vite 개발 서버(고친 화면 바로 반영) |
| `E2E_FRONT_REBUILD=0` | 꺼짐 | 있던 빌드본을 다시 안 빌드하고 씀 (화면 코드가 더 새롭거나 빌드 값이 다르면 그래도 다시 빌드함) |
| `E2E_RUN_ID` | 자동 | 실행 번호 — 계정 이메일 `e2e+<번호>-…@example.test`·결과 폴더 이름 |
| `E2E_OUTPUT_DIR` | `test-results/<실행 번호>` | 실패 사진·trace 폴더 |
| `E2E_STALE_HOURS` | `6` | 실행 시작 정리가 지우는 "오래된" 기준 시간 |
| `E2E_KEEP_ACCOUNTS=1` | 꺼짐 | 실행 끝에 이번 실행 계정을 안 지움 |
| `E2E_OUTSIDE_ROUTE=all` | 꺼짐 | 모든 브라우저 창에 바깥 막기 가로채기를 검 (아래 4장, 보통은 안 넣음) |

## 3. 화면 서버 (빌드본이 기본)

이 장은 시험이 보는 화면이 어떻게 만들어지는지 적음.

- 시작할 때 화면을 한 번 빌드해 `.runtime/front/<desktop·mobile·admin>`에 두고 작은 정적 서버로 줌
  - 그림·소리(`frontend/public`)는 베끼지 않고 그 폴더에서 바로 줌
  - 화면 안 주소(`/lobby` 등)는 index.html로 답함
- 빌드는 **개발 모드 값**(`NODE_ENV=development` → `import.meta.env.DEV === true`)
  - 개발 전용 길·단추·토스 시험 키 검사가 개발 서버와 같음
  - 결과 화면 미리보기 주소(`?outcome=`)는 운영 빌드에서만 막힘 → 시험 빌드에선 열림
- **화면 폴더의 `.env` 파일은 안 읽음** (`envDir: false`) — 개발 주소·진짜 광고 값이 시험 빌드에 섞이지 않게
  - 백엔드 주소는 `VITE_API_BASE_URL=http://localhost:4100`을 직접 줌
  - 모바일은 **가짜 광고 값**을 직접 줌: `VITE_AD_PROVIDER=adsense`, `VITE_ADSENSE_CLIENT=ca-pub-0000000000000000`, 단위 `1111111111`·`2222222222`
- 화면 코드를 고치면 화면 서버를 다시 켜야 반영됨 (고치면서 바로 보려면 `E2E_FRONT=dev`)
  - `E2E_FRONT_REBUILD=0`이어도 화면 코드가 빌드본보다 새로우면 다시 빌드함 (빌드 표시 파일 `e2e-build.json`으로 가림)
- 손으로 하나만: `node scripts/serve-front.js desktop` (확인용 다른 포트: `E2E_FRONT_PORT=5283`)

## 4. 바깥으로 안 나가게

이 장은 시험이 진짜 광고·결제사·메일로 요청을 안 보내게 막아 둔 것을 적음.

| 무엇 | 어떻게 막나 | 어디 |
|---|---|---|
| 광고·분석 주소 (googlesyndication·doubleclick·google-analytics 등) | 크로미움 시작 값(`--host-resolver-rules`)으로 "없는 주소" 처리 → 모든 창에 걸림 | `playwright.config.js`, `helpers/outside.js` |
| 토스 주소 (`tosspayments.com`·`toss.im`) | 위와 같음 | 같음 |
| 모바일 광고 꾸러미(`adsbygoogle.js`) | 모바일 창마다 가로채기(route)로 **가짜 꾸러미**를 답함 → 광고 칸이 "시험 광고"로 채워짐 | `helpers/fixtures.js`가 창을 만들 때 |
| 사파리(WebKit) | 시작 값이 없어 창마다 가로채기로 막음 | 같음 |
| 백엔드 → 토스 승인 | 막다른 주소(`TOSS_API_BASE_URL=http://127.0.0.1:9`), 가짜 승인 서버를 쓰는 시험은 자기 주소로 덮음 | `helpers/backendEnv.js` |
| 메일 | 파일로만 받음 (`MAIL_TEST_OUTBOX_DIR`) | 같음 |
| 소셜 로그인 | 진짜 키를 안 넣음. 가짜 제공자는 시험이 로컬 포트에 띄움 | `tests/auth/_a11a-kit.js` |

- 실행 시작 때 크로미움 시작 값이 진짜 먹는지 한 번 확인함. 안 먹으면 `E2E_OUTSIDE_ROUTE=all`로 바꿔 모든 창에 가로채기를 검 (경고 글이 찍힘)
- 가로채기를 건 창은 브라우저 캐시(잠깐 저장해 두기)가 꺼짐(Playwright 규칙) → 그래서 꼭 필요한 창(모바일·사파리)에만 검
- 시험이 자기 가로채기를 나중에 걸면 그쪽이 먼저 불림 → 광고 시험(`_a18-kit.js` `guardAds`)·충전 시험(`blockToss`)은 그대로 돎
- **모바일 결과 화면의 한 판 끝 광고 창**: 결과판이 나오고 1.5초 뒤 뜨고, 5초 지나야 "닫기"가 나옴. 결과판을 덮으므로 단추를 누르기 전에 `ui.closeResultAd(page)`로 닫음
- 아직 나가는 것: 글꼴 주소(`fonts.googleapis.com`·`cdn.jsdelivr.net`) — 막으면 글꼴이 바뀌어 자리·대비 확인이 달라져서 그대로 둠

## 5. 프로젝트 일곱

이 표는 시험이 어느 프로젝트(브라우저 종류·크기 묶음)에서 도는지 보여 줌. 개수는 2026-11-16 낮 `--list` 기준(쓰는 중이라 조금씩 바뀜).

| 프로젝트 | 무엇 | 화면 | 개수 |
|---|---|---|---|
| desktop | `tests/` 중 `mobile/`·`admin/` 밖 | 1280×800, 5273 | 2,032 |
| mobile | `tests/mobile/**` | 375×812 세로 + 터치(Pixel 7 바탕), 5274 | 748 |
| mobile-safari | 모바일 시험 중 이름에 `@safari` 붙은 것만 한 번 더 | iPhone 13 바탕(WebKit), 5274 | 64 |
| admin | `tests/admin/**` 중 `phone/` 밖 | 1280×800, 5275 | 80 |
| admin-phone | `tests/admin/phone/**` | 375×812 + 터치, 5275 | 12 |
| serial | 이름에 `@serial`·`@shutdown` 붙은 것 (서버 전체에 걸림) | 앞 프로젝트가 다 끝난 뒤 한 번에 하나 | 69 |
| admin-phone-serial | `tests/admin/phone/**` 중 `@serial` | serial 끝난 뒤 한 번에 하나 | 2 |

- 합 3,007개(서버 1대) / 3,078개(`E2E_NODES=2`, `tests/multinode/**` 포함)
- 시험 하나 제한 2분, 기다림 10초, 누르기 15초, 실패하면 한 번 다시(`retries: 1`). 더 긴 시험은 그 시험 안에서 `test.setTimeout(...)`
- 사파리 받기: `npx playwright install webkit`. 윈도우의 WebKit은 진짜 아이폰과 글꼴·키보드·주소창 높이가 달라 동작(누르기·알림·소켓)을 보는 데 씀

## 6. 폴더

이 표는 `tests/` 아래 폴더가 무엇을 보는지 보여 줌. 파일 이름은 `aNN-이름.spec.js`(NN = 목록 번호), `_`로 시작하는 파일은 그 폴더 도우미.

| 폴더 | 파일 | 무엇 |
|---|---|---|
| ingame | 139 | PC 판: 역할 확인·낮 토론·투표·재판·밤 행동·채팅·끊김과 나가기·승패·골드 |
| mobile | 111 | 모바일 화면 전부 (대기방·판·결과·상점·계정·친구·광고) |
| admin | 41 | 관리자 화면 (PC·휴대폰 크기) |
| multinode | 28 | 서버 2대일 때만 (`E2E_NODES=2`) |
| room | 25 | 방 만들기·방 목록·코드 입장·대기방·시작·추방 |
| result | 22 | 결과 화면·"대기방으로"·"로비로"·180초 |
| social | 18 | 친구·알림·초대·신고 |
| security | 16 | 막아 둔 취약점이 진짜 막혔는지 |
| lobby | 13 | 로비 들어올 때 정리·점검 안내·중복 접속 |
| auth | 12 | 로그인·가입·아이디 찾기·비번 재설정·소셜·세션 |
| mypage | 10 | 계정 관리(닉네임·이메일·비번 바꾸기)·탈퇴·이모티콘·끼우기 |
| maintenance | 9 | 점검·서버 끄고 켜기·운영 값 검사 |
| store | 8 | 상점·구매·충전·쿠폰 |
| inquiry | 1 | 고객센터 문의 |

## 7. 꼭 지킬 것 (요약)

이 장은 시험을 쓸 때 규칙을 줄여 적음. 자세한 것은 `docs/게임_의도_2026-11-15/시험_도우미.md`.

- **시험 이름은 목록 번호로 시작**: `A03-E-001 …`(간단) / `A03-H-001 …`(어려움), 값 하나 = `test()` 하나
- **판은 5명 이상** (서버가 4명 이하 판은 시작 거절, 대기방 "게임시작"도 4명 이하면 미리 꺼짐), 직업은 늘 정해 줌(`roles`)
- **계정은 시험마다 새로** (`accounts.create()` · `user` · `players.add()`), 시험끼리 값을 나눠 쓰지 않음
- **표시(tag)는 이름 끝에**: `@game`(판을 씀) · `@hard`(어려움) · `@realtime`(진짜 시간 기다림) · `@smoke`(파일마다 1개) · `@safari`(사파리에서도) · `@serial`·`@shutdown`(서버 전체에 걸림) · `@single-node`(서버 한 대라야 뜻 있음)
- **"보임"은 `expectReadable`로** (`helpers/visible.js` — 보임·크기·화면 안·안 가려짐·대비). `toBeVisible`만으로 끝내지 않음
- **기다림**: 고정 쉬기 대신 `expect(...).toHaveText` · `expect.poll`. 긴 단계는 손잡이(`t.advance()` 등)로 넘기되, **확인하려는 시간 규칙은 넘기지 않음**
- `test.skip` · `test.only` · `test.fixme` 안 씀
- 고르개(찾는 법): 화면 글 · `getByRole(이름)` · aria-label 먼저, 그다음 `data-testid`
- 화면이 `window.alert`로 알리는 곳은 `ui.captureAlert(page, () => 누르기)` (PC 대화상자·모바일 양피지 안내 창 둘 다 읽음)
- 토스 결제창은 **가로채 흉내 낸 것만** 열고 닫음. 진짜 결제·바깥 요청 없음
- 개발 서버(4000·5173·5174)·개발 DB(`joker`·`joker_realgame`)·백엔드 시험 DB(`pluto_f01_20260909_al`)는 안 건드림

### 포트

| 포트 | 누가 |
|---|---|
| 4000 · 5173 · 5174 | 사용자 개발 서버 (안 씀) |
| 4100 (·4101~4108) | 시험 백엔드 (서버 여러 대면 4100은 앞단) |
| 5273 · 5274 · 5275 | 시험 화면 (PC·모바일·관리자) |
| 4150 + 작업자 번호 | `servers.startExtraBackend()` 기본 (시험 하나만 쓰는 백엔드) |
| 4160 + 작업자 번호 | 충전 시험의 따로 띄운 백엔드 |
| 4170 + 작업자 번호 | 충전 시험의 가짜 토스 승인 서버 / 소셜 시험의 따로 띄운 백엔드 (같은 작업자 칸에서는 한 번에 하나만 돌아 안 부딪힘) |
| 4180 + 작업자 번호 | 소셜 시험의 가짜 제공자 |
| 4190 ~ 4199 | 보안 시험 전용 |
| 6380 | 시험 Redis (서버 여러 대일 때) |

## 8. 도우미 (`helpers/`)

이 장은 공용 도우미가 무엇을 주는지 한 줄씩 적음. 모든 시험은 `const { test, expect, ui, mail, internal, e2e, E2E } = require('../../helpers/fixtures');`로 시작함.

### 시험 인자 (`fixtures.js`)

| 인자 | 쓰는 법 | 돌려줌 |
|---|---|---|
| `accounts` | `await accounts.create({ nickname?, password?, birthDate?, emailVerified?, agreeTerms?, role? })` · `createMany(n)` | `{ uuid, email, password, nickname }` — 실제 가입과 같게(이메일 인증 끝·약관 동의·만 14세·기본 지급) |
| `user` | 기본 `page`를 새 계정으로 로그인(API 쿠키) → 로비 | `{ account, page, context }` |
| `players` | `await players.add({ mobile?, account?, lobby=true, login=true })` 사람 더 (각자 따로 쿠키) | `{ account, context, page }` (시험 끝에 닫힘) |
| `bots` | `await bots.spawn(n)` 소켓 봇(자동 플레이어) | `E2eBot[]` |
| `table` | `await table.setup({ humans, bots, settings, roles })` 판 차리기 | `Table` |
| `mail` · `internal` · `e2e` · `ui` | 아래 모듈 그대로 | |

### 판 (`game.js` — `table.setup`)

```js
const t = await table.setup({
  humans: [user],                     // 브라우저 사람 (코드 입장·준비완료를 화면으로 누름)
  bots: 4,                            // 첫 봇이 방장. 안 주면 5명 판이 되게 채움, 합 5명 밑이면 차리기 전에 오류
  settings: { jokerCount: 1 },        // 기본 FAST: 토론·투표·밤 30초, 재판 15초, 정원은 인원에 맞춤
  roles: ({ humans, bots }) => ({ [humans[0].account.uuid]: 'DOCTOR', [bots[0].account.uuid]: 'JOKER' }),
});
await ui.readRoleReveal(user.page);   // '의사' (확인 누름)
t.playBots({ dayVote: user.account.uuid, tribunal: 'GUILTY', night: 'skip' });
await t.advanceUntil('NIGHT');        // 지금 단계 마감 타이머를 바로 돌림
const s = await t.state();            // { gameId, phase, dayIndex, dayPhase, nightTurnRole, tribunal, winResult, players:[{uuid,nickname,role,alive}] }
```

- 직업 직접 구성: `settings: customRoleSettings({ JOKER: 1, DOCTOR: 1, GUARD: 1 })` (자동 구성은 6명부터 의사, 8명 경비원, 10명 마녀사냥꾼)
- 정한 직업은 `t.state()`로 한 번 확인 (서버 예약이 가끔 못 맞음 → 서버 로그 `[e2e] 역할 미리 정하기 못 맞춤`)
- 봇 표로 처형하기 전엔 `await t.assertBotsCanExecute(uuid)` — 낮 투표는 최다 득표가 기권보다 많아야 재판 (사람은 안 내면 기권으로 셈)
- 손잡이: `t.advance()`(단계 바로 끝내기) · `t.expireGraces()`(끊김 60초 바로 끝내기) · `t.closeResults()`(결과 화면 180초 바로 닫기)
- 결과 화면까지 기다리기: `waitResult(page)` — 밤 암살로 끝난 판의 낮 시작 연출(못 끝난 영상 "건너뛰기"·글 창 "확인")도 넘김
- 판 끝까지: `playToResult({ user, table, kind })` · 사람이 방장인 판: `hostGame({ host, guests, botList })` — 둘 다 `tests/room/roomHelpers`

### 나머지 한 줄씩

| 파일 | 무엇을 줌 |
|---|---|
| `internal.js` | `internal.announceTo(uuids)` 공지 · `internal.disconnect(uuid)` 강제 끊기 · `reloadMaintenance()`·`reloadBannedWords()` 다시 읽기 · `e2e.setRoles`·`gameOf`·`roomOf`·`advance`·`expireGraces`·`closeResults` (열쇠는 `.env.e2e`) |
| `ui.js` | `gotoLobby` · `loginViaUi`·`loginViaApi` · `joinRoomByCodeUi` · `readyUi` · `readRoleReveal` · `closeOverlays`(연출 창 닫기 — 못 끝난 암살 영상의 "건너뛰기"도 누름) · `closeResultAd`(모바일 광고 창 닫기) · `sendChat`·`expectChat` · `captureAlert` · `ROLE_LABELS` |
| `visible.js` | `expectReadable(locator, { large?, contrast? })` · `expectAllReadable` · `readability` — 그림 단추는 안쪽 글 칸의 글자색을 읽음, `pointer-events:none` 글도 "안 가려짐"으로 바르게 봄 |
| `accounts.js` | 계정 만들기·지우기, `randomNickname()`·`koreanNickname()`(한글로 시작하는 겹치지 않는 닉네임). 무작위 닉네임이 겹치면 새 닉네임으로 다시 만듦 |
| `adminAccounts.js` · `adminAccess.js` | `createAdmin()` · `loginAsAdmin(page, account)` · `openAdminWindow(browser, { phone? })`(관리자 창 + 로그인) · `adminCall`·`adminApi(adminPage, method, path, data)`(관리자 API 부르기) · `allowAccess`·`denyAccess`(Access 통과 쿠키) |
| `maintenance.js` | `setMaintenance({ enabled, startsInMs?, message? })` — `startsInMs`를 안 주면 **시작 시각 없이** 켬(새 판만 막음) · `clearMaintenance()` (`@serial` 시험만, finally에서 꼭 끔) |
| `servers.js` | `triggerShutdown()`(서버 끄기, 곧 다시 켜짐) · `waitBackendUp()`(`@shutdown` 시험은 finally에서 꼭) · `startExtraBackend({ port?, overrides, expectExit })`(시험 하나만 쓰는 백엔드) |
| `security.js` | `trapXss`·`xssPayloads`·`assertNoXss` · `readResponse` · `parseSetCookie`·`cookieAttributes` · `loginCookie` · `openRawSocket` |
| `mail.js` | `waitForCode(email)` · `waitForResetUrl(email, { since })` · `readMails(email)` · `toMobile(url)`(재설정 링크는 PC 주소로 옴) |
| `toss.js` | `openTossWindow(page)`·`closeTossWindow(page)` — 시험이 토스 주소를 가로채 흉내 낸 창만 (안 가로채면 막혀서 안 뜸) |
| `friends.js` | `api(person, method, path)` · `makeFriends(a, b)` · `sendRequest(from, to)` |
| `db.js` | `query(sql, [값])` · `sqlTime()`(DB 시각은 UTC — JS `Date`를 날 SQL에 그대로 넣으면 9시간 어긋남) · `assertTestDb()` |
| `bannedWords.js` | 금지어 넣고 빼기 (낱말은 시험마다 무작위로) |
| `outside.js` | 바깥 막기 (4장) — 시험이 직접 부를 일은 없음 |
| `backendEnv.js` · `env.js` | 시험 백엔드 환경값·포트·주소 |

### 실행 시작·끝 정리

- **시작**(`global-setup.js`): 만든 지 `E2E_STALE_HOURS`(6)시간 넘은 시험 계정·탈퇴 계정·관리자 계정, 그만큼 안 쓴 메일 파일·결과 폴더만 지움. 지금 도는 남의 실행 것은 안 건드림
- **끝**(`global-teardown.js`): 이번 실행(`E2E_RUN_ID`) 계정만 지움
  - 이메일 모양(`e2e+<실행 번호>-…`)으로 한 번
  - 탈퇴·이메일 바꾸기로 이메일이 달라진 계정은 `.runtime/accounts/`에 적어 둔 계정 번호로 한 번 더
  - 화면으로 가입한 뒤 탈퇴한 계정은 적힌 것이 없어 다음 실행 시작 정리가 지움
- 지우기 전에 **실제로 붙은 DB 이름이 `joker_e2e`인지 서버에 물어 확인**함. 다르면 아무것도 안 지움
- 지우는 사이 서버가 그 계정 줄을 새로 쓰면 외래키(다른 표와 잇는 칸)에 막힘 → 딸린 줄부터 다시 지움. 그래도 못 지우면 경고만

## 9. 견본과 옛 기록

- 견본(베껴 쓰는 틀): `tests/result/a08-sample-close-results.spec.js`
- `문제목록/` 폴더: 2026-11-09~10에 옛 시험을 돌리며 적은 기록 (지금 시험과 번호가 다름, 참고만)

## 10. 알려진 문제

- **새 계정 여럿이 동시에 처음 로그인하면 가끔 500**: DB 교착(서로 잠금을 기다리다 멈춤) 때문. 도우미(`loginViaApi`·봇 로그인)는 500일 때만 몇 번 다시 하고 `[e2e] … → 다시` 경고를 남김. 로그인 자체를 보는 시험은 `loginViaUi`(다시 안 함)를 씀
- 비번 재설정 링크 주소는 PC(5273)로 옴 → 모바일 시험은 `mail.toMobile()`
- 모바일 결과 화면에는 늘 광고 창이 뜸(4장) → 닫지 않고 "대기방으로"를 누르면 광고 창에 가려 못 누름

---

## 개발자용 부록 — 건너뛰어도 됨

### 관리자 시험의 문 흉내

- **문 1 (클라우드플레어 Access) 흉내**: 화면 서버(`scripts/admin-gate.js`)가 켤 때 RSA 열쇠를 새로 만들어 공개키를 `/__e2e/access-certs`로 줌(백엔드 `ADMIN_ACCESS_CERTS_URL`). 브라우저에 쿠키 `e2e_access_email`이 있을 때만 그 이메일로 서명한 표를 `Cf-Access-Jwt-Assertion`에 붙임. 쿠키가 없으면 백엔드가 403 → "접근 권한 없음" 화면. 백엔드는 Access를 켠 채(`required`) 진짜 검증 코드 그대로 돎
- **가짜 IP**: 쿠키 `e2e_client_ip`를 화면 서버가 `X-Forwarded-For`로 넘김 → 시험마다 IP가 달라 로그인 잠금(IP 15분 20번)·요청 수(1분 10번)가 서로 안 섞임 (`allowAccess`가 무작위로 정함)
- 같은 OTP(한 번 쓰는 번호)는 한 번만 받음 → 한 계정으로 두 번 로그인하면 `loginAsAdmin`이 다음 30초 칸까지 기다림
- 서버 전체에 걸리는 관리자 시험(점검·전체 공지)은 이름에 `@serial`, 주소는 `E2E.adminUrl` 직접 (serial 프로젝트는 기본 주소가 PC 화면) → `openAdminWindow(browser)`로 창을 엶
- 환경값: 백엔드에 `ADMIN_TOTP_KEY`(`.env.e2e`)·`ADMIN_ORIGIN=http://localhost:5275`·`ADMIN_ACCESS_TEAM_DOMAIN`·`ADMIN_ACCESS_AUD`·`ADMIN_ACCESS_CERTS_URL`을 넣음 (`helpers/backendEnv.js`, 밖의 `ADMIN_*` 값은 안 섞음)

### 시험 손잡이 경로 (`/e2e/*`)

백엔드가 `E2E_HOOKS=1`이고 운영이 아닐 때만 붙음 (운영에 이 값이 있으면 시작 거부).

| 경로 | 무엇 |
|---|---|
| `POST·DELETE /e2e/role-presets` | 다음 판 직업 미리 정하기·지우기 (방·사람마다 따로 예약 → 병렬 판끼리 안 섞임) |
| `GET /e2e/users/:uuid/game` · `/room` | 그 사람 판·대기방 요약 |
| `GET /e2e/games/:gameId` | 판 요약 (직업·생존·단계) |
| `POST /e2e/games/:gameId/advance` | 지금 단계 마감 타이머 바로 돌리기 |
| `POST /e2e/games/:gameId/expire-graces` | 끊김 60초 바로 끝내기 |
| `POST /e2e/games/:gameId/close-results` | 결과 화면 180초 바로 닫기 |

### 봇 행동 지정 (`t.playBots(plan)`)

- `dayChat` · `readyForVote`(기본 true) · `dayVote`(`'random'`·`'abstain'`·`'skip'`·uuid·닉네임·함수)
- `tribunal`(`'GUILTY'`·`'NOT_GUILTY'`·`'skip'` = 안 냄)
- `night`(대상, 광대는 동료 빼고, 마녀사냥꾼 `'random'`은 죽은 사람 중) · `jokerChat` · `deadChat`(죽은 뒤 한 번) · `pollMs`
- `'skip'`은 안 내는 것이라 그 단계는 마감까지 감 → `t.advance()`로 넘김
