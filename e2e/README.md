# 브라우저 시험 (Playwright)

진짜 브라우저로 누르는 시험. 시험 전용 DB·포트로 따로 돌아서 개발 서버(4000·5173·5174)·개발 DB와 안 부딪힘.

| 것 | 값 |
|---|---|
| 시험 DB | docker `jokertest-db-1` 안 `joker_e2e` (계정 `mmc_e2e`, 이 DB만 권한) |
| 백엔드 | `http://localhost:4100` (`scripts/start-backend.js`가 켬, 꺼지면 다시 켬) |
| 데스크톱 화면 | `http://localhost:5273` (`scripts/serve-front.js desktop` — 기본 빌드본, `E2E_FRONT=dev`면 vite 개발 서버) |
| 모바일 화면 | `http://localhost:5274` (`scripts/serve-front.js mobile` — 같음) |
| 관리자 화면 | `http://localhost:5275` (`scripts/serve-front.js admin` — 늘 빌드본, `/admin-api`는 4100으로 넘김, 클라우드플레어 Access 흉내 — 아래 '관리자 시험') |
| 비밀값 | `e2e/.env.e2e` (git 안 올라감, 처음 `npm run db:setup`이 무작위로 만듦, 토스 시험 키만 backend/.env에서 옮김) |
| 서버 로그 | `e2e/.runtime/backend.log` (SQL까지 다 있음) |
| 받은 메일 | `e2e/.runtime/mail/<주소>.jsonl` (진짜 메일 안 나감) |
| 결과 | `reports/html` (npm run report), `reports/results.json`, 실패 사진·trace는 `test-results/<실행 번호>/` (실행마다 따로) |

## 띄우는 법

```bash
cd e2e
npm install                 # @playwright/test 1.62.1 (브라우저는 이미 있는 chromium-1234 씀)
npm run db:setup            # 시험 DB 만들기·마이그레이션 0001~0029·시험 상품 (다시 돌려도 됨)
npx playwright test         # 전부: desktop·mobile 동시 → 끝나면 serial(서버 꺼짐 등) 하나씩
```

- 서버 셋은 Playwright가 알아서 켜고 끝나면 끔. 이미 켜 둔 걸 쓰려면 `E2E_REUSE=1`.
- 한 파트만: `npx playwright test --no-deps tests/room` · 한 프로젝트만: `--project=mobile`
  - `--no-deps` 꼭 붙이기: serial 프로젝트가 앞 프로젝트(desktop·mobile 등)를 먼저 돌리게 묶여 있어 안 붙이면 파일 거르기가 앞 프로젝트에 안 먹고 전부 돎 (`E2E_NODES=2`에서도 같음)
  - 다만 `--no-deps`면 serial 시험(서버 끄기 등)이 다른 프로젝트와 같이 돌 수 있음 → serial은 `--project=serial`로 따로
- 판 시험 빼고: `npm run test:fast` · 판 시험만: `npm run test:game`
- 서버 꺼짐 같은 serial만: `npm run test:shutdown` (= `--project=serial --no-deps`)
- 시험 DB 새로: `npm run db:reset` · 계정 남기기: `E2E_KEEP_ACCOUNTS=1`
- 동시 수: `E2E_WORKERS=8` (기본 6)

### 바꿀 수 있는 값 (환경값)

| 값 | 기본 | 무엇 |
|---|---|---|
| `E2E_REUSE=1` | 꺼짐 | 켜 둔 서버(4100·5273·5274) 그대로 씀 |
| `E2E_FRONT` | `build` | 화면 서버: `build` = 빌드본 + 작은 정적 서버(CPU 적게), `dev` = vite 개발 서버(고친 화면 바로 반영) |
| `E2E_FRONT_REBUILD=0` | 꺼짐 | build일 때 있던 빌드본(`.runtime/front/<desktop·mobile>`)을 다시 안 빌드하고 씀 |
| `E2E_RUN_ID` | 자동(시각+무작위) | 실행 번호 — 계정 이메일 `e2e+<번호>-…@example.test`·결과 폴더 이름 |
| `E2E_OUTPUT_DIR` | `test-results/<실행 번호>` | 실패 사진·trace 폴더 (`--output`과 같음) |
| `E2E_STALE_HOURS` | `6` | 실행 시작 정리가 지우는 "오래된" 기준 시간 |
| `E2E_KEEP_ACCOUNTS=1` | 꺼짐 | 실행 끝에 이번 실행 계정 안 지움 |

### 화면 서버 (빌드본이 기본)

- `E2E_FRONT=build`(기본): 시작할 때 화면을 한 번 빌드(데스크톱·모바일 각각 몇 초, `VITE_API_BASE_URL=http://localhost:4100`) → `.runtime/front/<desktop·mobile>`에 두고 작은 정적 서버로 5273·5274에 줌. 그림·소리(`frontend/public` 200MB)는 베끼지 않고 public 폴더에서 바로 줌, 화면 안 주소(`/lobby` 등)는 index.html. vite 개발 서버보다 CPU를 훨씬 덜 씀(파일마다 바꾸기·감시 없음).
- 빌드는 **개발 모드 값 그대로**(`NODE_ENV=development` → `import.meta.env.DEV === true`): 개발 전용 길·버튼·토스 테스트 키 검사가 개발 서버와 같음. 빌드라서 `version.json`(새 버전 안내용)이 생김.
- **화면 코드를 고치면 화면 서버를 다시 켜야 반영됨**(빌드본은 안 바뀜). 고치면서 바로 보려면 `E2E_FRONT=dev`.
- 손으로 하나만: `node scripts/serve-front.js desktop` (확인용 다른 포트: `E2E_FRONT_PORT=5283`).

### 여럿이 같이 돌릴 때 (켜 둔 서버 + `E2E_REUSE=1`)

- **실행 시작 정리는 오래된 것만**: 만든 지 `E2E_STALE_HOURS`(6)시간 넘은 e2e 계정, 그만큼 안 쓴 메일 파일, `test-results/` 아래 지난 실행 폴더. 지금 도는 남의 실행 계정·메일은 안 지움(예전엔 전부 지워서 남의 시험이 깨짐 — 문제목록 ingame-c E1).
- **실행 끝 정리는 이번 실행(`E2E_RUN_ID`) 계정만**. 지우는 사이 서버가 그 계정 기록을 새로 쓰면(판 끝 `game_result_players`·접속 기록) 외래키에 막힘 → 딸린 줄부터 다시 지움(몇 번까지). 그래도 못 지우면 경고만(시험 결과에 오류로 안 섞임), 남은 건 6시간 뒤 다음 실행이 지움.
- 실패 사진·trace는 실행마다 `test-results/<실행 번호>/` → 서로 안 지움.
- 역할 미리 정하기는 방·사람마다 따로 예약(아래 'game.js') → 병렬 판끼리 안 섞임.

## 프로젝트 셋

| 프로젝트 | 무엇 | 화면 |
|---|---|---|
| desktop | `tests/` 중 `mobile/` 밖 전부 | 1280×800, 5273 |
| mobile | `tests/mobile/**` | 375×812 세로 + 터치 (Pixel 7 바탕), 5274 |
| mobile-safari | `tests/mobile/**` 그대로 한 번 더 (아이폰 사파리) | 375×812 세로 + 터치 (iPhone 13 바탕, WebKit), 5274 |
| serial | 이름에 `@serial`·`@shutdown` 붙은 시험 (어느 폴더든, `admin/phone` 빼고) | desktop·mobile·mobile-safari·admin·admin-phone 다 끝난 뒤 한 번에 하나 |
| admin | `tests/admin/**` 중 `phone/` 밖 (관리자 화면) | 1280×800, 5275 |
| admin-phone | `tests/admin/phone/**` (관리자 휴대폰 크기) | 375×812 + 터치, 5275 |
| admin-phone-serial | `tests/admin/phone/**` 중 `@serial` | serial 끝난 뒤 한 번에 하나 |

### 관리자 시험 (tests/admin)

- 다른 프로젝트(desktop·mobile·mobile-safari)는 `admin/**`를 안 돌림. 관리자만: `npx playwright test --project=admin --project=admin-phone`
- **문 1 (클라우드플레어 Access) 흉내**: 화면 서버(`scripts/admin-gate.js`)가 켤 때 RSA 열쇠를 새로 만들어 공개키를 `/__e2e/access-certs`로 주고(백엔드 `ADMIN_ACCESS_CERTS_URL`), 브라우저에 쿠키 `e2e_access_email`이 있을 때만 그 이메일로 서명한 표를 `Cf-Access-Jwt-Assertion`에 붙임. 쿠키 없으면 백엔드가 403 → "접근 권한 없음" 화면. 백엔드는 Access 켠 채(`required`)로 진짜 검증 코드 그대로 돎.
- **가짜 IP**: 쿠키 `e2e_client_ip`를 화면 서버가 `X-Forwarded-For`로 넘김 → 시험마다 IP가 달라 로그인 잠금(IP 15분 20번)·로그인 요청 수(1분 10번)가 서로 안 섞임 (`allowAccess`가 무작위로 정함).
- 도우미: `helpers/adminAccounts.js` — `createAdmin({ email })`(아이디 `e2e-<실행 번호>-…`, 실행 끝에 지움) · `otpNow(secret)` · `loginAsAdmin(page, account)` · `setAdminSessionIdle(page, 분)`(DB 세션 시각 당김) / `helpers/adminAccess.js` — `allowAccess(context, email)` · `denyAccess(context)` · `useClientIp(context, ip?)`
- 같은 OTP 번호는 한 번만 받음 → 한 계정으로 두 번 로그인하면 `loginAsAdmin`이 다음 30초 칸까지 기다림.
- 서버 전체에 걸리는 관리자 시험(점검·전체 공지)은 이름에 `@serial`, 주소는 `E2E.adminUrl` 직접 (serial 프로젝트는 baseURL이 데스크톱).
- 환경값: 백엔드에 `ADMIN_TOTP_KEY`(`.env.e2e`, `db:setup`이 처음 한 번 만듦)·`ADMIN_ORIGIN=http://localhost:5275`·`ADMIN_ACCESS_TEAM_DOMAIN`·`ADMIN_ACCESS_AUD`(시험 값, `helpers/env.js`)·`ADMIN_ACCESS_CERTS_URL`을 넣음 (`helpers/backendEnv.js`, 밖의 `ADMIN_*` 값은 안 섞음).
- 관리자 화면 코드를 고치면 화면 서버를 다시 켜야 반영(빌드본). 손으로: `node scripts/serve-front.js admin`.

### 아이폰 사파리 (mobile-safari)

모바일 시험을 WebKit(사파리 엔진)으로 한 번 더 돌림 — 기본 `npx playwright test`에 들어 있음. 처음 한 번 `npx playwright install webkit`(WebKit 26.5, playwright webkit v2336)로 브라우저 받기. 사파리만: `npm run test:safari` (= `--project=mobile-safari`), 켜 둔 서버 쓰면 `E2E_REUSE=1`. 윈도우의 WebKit은 진짜 아이폰과 글꼴·키보드·주소창 높이가 달라서, 픽셀 위치보다 동작(누르기·알림·소켓)을 보는 데 씀. 사파리에서만 깨지는 것은 `문제목록/safari.md`에 적음.

## 2단계 파트 표 (합계 2000)

폴더는 만들어 둠. 시험 파일은 `tests/<파트>/*.spec.js`.

| 파트 폴더 | 개수 | 내용 |
|---|---|---|
| ingame | 990 | 데스크톱 인게임 전부: 역할 공개(10초·확인 버튼), 낮 토론 채팅, 투표(동점·기권 → 밤, 재투표 없음), 재판(유죄·무죄·시간 초과는 기권, 재판 시간 설정 반영), 밤 행동 직업별(광대·의사·경비원·마녀사냥꾼 둘째 밤부터, 광대끼리 지목 막음), 밤 같은 직업 채팅, 죽은 사람 채팅(낮·재판·밤, 산 사람은 못 봄), 사망·처형 연출, 승패 조건, 나가기·다시 접속·끊김, 서버 꺼짐 안내, 이모티콘, 카드 메뉴, 설정·기록 시트, 진행 바·타이머, 금지어 가리기, 신고 증거 + 직업 조합과 인원(5~10명)별 승패, 동시에 여러 판, 긴 판(5일 이상), 다시 접속 여러 번, 밤 차례 알림 창, 죽은 사람이 밤 알림 창 때문에 채팅이 잠기는지 |
| mobile | 300 | 모바일 화면 전부: 카톡형 인게임 위주(초상 띠·말풍선·시스템 줄·단계 줄·"죽은 사람끼리" 띠·"밤 · 같은 직업끼리"·시트·길게 누르기·키보드 접힘) + 로비·방·결과·상점·마이페이지 세로 화면, 가로·태블릿 칸 배치, 광고 자리 |
| security | 300 | 취약점이 실제로 막혔는지 브라우저로 (근거: `docs/보안_점검_2026-11-09.md`의 고친 항목 전부) — 아래 '보안 파트' |
| room | 110 | 방 만들기 설정(재판 시간 포함), 방 목록, 코드 입장, 대기방 준비, 시작 조건, 강퇴, 설정 바꾸기, 마감 방 |
| auth | 90 | 로그인·가입(이메일 인증·약관·14세)·아이디 찾기·비번 재설정·소셜 버튼·로그아웃·세션 만료 |
| lobby | 60 | 메뉴·친구(신청·수락·거절·즐겨찾기·삭제)·초대·알림(읽음·지우기)·공지·고객센터 |
| result | 70 | 결과·MVP·신고(사유·중복·제한)·대기방으로·로비로·전적 |
| store | 40 | 상점 탭·구매·이모티콘·스킨 장착·쿠폰·결제창 열고 닫기·환불 안내 |
| mypage | 40 | 계정 관리(닉네임·이메일·비번 변경·탈퇴)·디스코드 연결 버튼·설정·서고 |

### 보안 파트 (security 300)

| 확인할 것 | 쓰는 도우미 |
|---|---|
| 채팅·닉네임·신고 메모·공지에 스크립트를 넣어도 실행 안 됨 (XSS) | `security.trapXss` · `xssPayloads` · `assertNoXss` |
| 남의 판 결과·알림·주문을 주소만 바꿔서 못 봄 (IDOR) | `players.add`로 두 사람, `context.request`로 남의 id 부르기 |
| 로그인 실패 문구로 계정이 있는지 알 수 없음 | `ui.captureAlert`, `security.readResponse` |
| 이메일 칸 쉼표·`@` 두 개, 큰 본문·`__proto__` | `security.readResponse` (fetch 직접) |
| 로그인·쿠폰·인증번호 요청 수 제한 | `servers.startExtraBackend()` (운영 기본 ip 제한으로 따로 띄움 — 본 서버 4100은 ip 제한을 크게 풀어 둠) |
| 소켓 Origin 검사·이벤트 수 제한 | `security.openRawSocket({ cookie, origin })` · `emitAck` |
| 쿠키(HttpOnly·SameSite)·보안 헤더 | `security.readResponse` · `parseSetCookie` · `cookieAttributes` |
| 로그아웃·비번 변경 뒤 옛 세션 끊김 | `players.add` 두 context에 같은 계정, `security.loginCookie` |
| 정지·탈퇴 계정이 못 들어옴 | `db.query`로 정지 줄 넣기 → `internal.disconnect(uuid)` |
| 관리자 통로가 열쇠 없으면 막힘 | `internal.raw(method, path)` 열쇠 빼고는 `fetch` 직접 |
| 운영에서 약한 JWT로 시작 거부 | `servers.startExtraBackend({ expectExit: true, overrides: { NODE_ENV: 'production', JWT_SECRET: 'short', E2E_HOOKS: undefined, MAIL_TEST_OUTBOX_DIR: undefined } })` → `code === 1` |
| 토스 금액 위조 | `context.request`로 주문 금액 바꿔 보내기 (결제창은 `toss.js`로 열고 닫기만) |

## 규칙 (2단계 에이전트 꼭 지킬 것)

- **시험 이름은 한국어 "무엇을 하면 → 무엇이 됨"**. 예: `'비번을 틀리면 → 알림이 뜨고 로그인 화면에 그대로 있음'`
- **계정은 시험마다 새로** (`accounts.create()` · `user` · `players.add()`). 미리 만든 공용 계정·tester1 같은 개발 계정 쓰지 않음.
- **시험끼리 상태 공유 금지**: 전역 변수·파일·`test.describe.serial`로 앞 시험 결과 이어 쓰기 금지. 한 시험 안에서 다 만들고 확인.
- **서버 전체에 걸리는 것은 `@serial`** (이름 끝에 붙임): 점검(`maintenance_state`), 접속자 전체 공지(`target: 'online'`), 서버 꺼짐(`@shutdown`). 금지어는 시험마다 무작위 낱말이면 병렬 괜찮음.
- **판 시험은 `@game`** 태그 (한 판 10~30초 — `npm run test:fast`에서 빠짐).
- **고르개**: 화면 글자 · `getByRole(이름)` · aria-label 먼저. 꼭 필요할 때만 화면 코드에 `data-testid`를 **최소로** 추가(동작 안 바꿈, 고치기 직전 그 파일을 다시 읽고 남의 변경 살리기, 커밋은 `git commit -- <그 파일>`).
- **기다림**: `page.waitForTimeout` 대신 `expect(...).toBeVisible()` · `toHaveURL` · `expect.poll`. 판 단계는 기다리지 말고 `table.advanceUntil`.
- 화면이 `window.alert`로 알리는 곳(로그인 실패·가입 완료·서버 꺼짐 안내)은 `ui.captureAlert(page, () => 누르기)` — 데스크톱 대화상자(누르는 도중 떠도 안 멈춤)와 모바일 양피지 안내 창(`alertdialog "안내"`, 모바일은 `window.alert`를 이 창으로 바꿔 둠) 둘 다 읽고 닫음. `page.waitForEvent('dialog')`는 데스크톱에서만 됨(모바일은 안 옴).
- 로비에 처음 오면 인트로 영상이 뜸 → `ui.gotoLobby(page)` / `ui.skipIntro(page)`.
- 토스 결제창은 **열고 닫기만**. 카드사·간편결제 고르기, 카드 번호 입력, 결제 완료는 하지 않음.
- 개발 서버(4000·5173·5174)·개발 DB(`joker`·`joker_realgame`)·백엔드 시험 DB(`pluto_f01_20260909_al`)는 건드리지 않음.

## 병렬

- 기본 workers **6**. 판 시험 3종을 `--repeat-each=8`로 돌려 **8개·12개 동시 모두 24/24 통과** 확인(2026-11-09, 16코어 PC). 8 넘겨도 빨라지지 않음 → **안전한 최대 8**.
- 판 시험 하나 약 15~25초 (단계 넘기기 씀). 판 시험 990개 ≈ 990×20초 ÷ 8 ≈ 40분 예상.
- 서버 하나에 판 여러 개가 동시에 돎(방·계정이 시험마다 달라서 안 섞임). 한 시험 안에서 판 여러 개도 됨(`table.setup` 여러 번).

## 도우미 (`helpers/`)

모든 시험은 `const { test, expect, ui, mail, internal, e2e, E2E } = require('../../helpers/fixtures');`

### fixtures.js — 시험 인자

| 인자 | 쓰는 법 | 돌려줌 |
|---|---|---|
| `accounts` | `await accounts.create({ nickname?, password?, birthDate?, emailVerified?, agreeTerms?, role? })` · `createMany(n)` | `{ uuid, email, password, nickname }` — 실제 가입과 같게(이메일 인증 끝·약관 동의·만 14세·기본 지급). `agreeTerms:false`면 재동의 창, `birthDate`로 14세 미만 |
| `user` | 기본 `page`를 새 계정으로 로그인(API 쿠키) → 로비(인트로 넘김) | `{ account, page, context }` |
| `players` | `await players.add({ mobile?, account?, lobby=true, login=true })` 사람 더 (각자 따로 쿠키) | `{ account, context, page }` (시험 끝에 닫힘) |
| `bots` | `await bots.spawn(n)` 소켓 봇 (로그인·접속됨) | `E2eBot[]` |
| `table` | `await table.setup({ humans, bots, settings, roles })` 판 차리기 | `Table` (아래) |
| `mail` · `internal` · `e2e` · `ui` | 아래 모듈 그대로 | |

로그인 화면을 거치는 것: `ui.loginViaUi(page, account)` · 쿠키만 넣는 것: `ui.loginViaApi(context, account, { rememberMe })` 후 `ui.gotoLobby(page)`.

### game.js — 판 (`table.setup`)

```js
const t = await table.setup({
  humans: [user, p2],                 // 브라우저 사람 (코드 입장·준비완료를 화면으로 누름)
  bots: 4,                            // 첫 봇이 방장 (최소 1)
  settings: { jokerCount: 1, tribunalTime: 15 },   // 기본 FAST: 토론·투표·밤 30초, 재판 15초, 정원은 인원에 맞춤
  roles: { [user.account.uuid]: 'DOCTOR' },        // 또는 ({ humans, bots }) => ({ ... })
});
await ui.readRoleReveal(user.page);   // '의사' (확인 누름)
t.playBots({ dayVote: user.account.uuid, tribunal: 'GUILTY', night: 'skip', deadChat: '죽은 봇' });
await t.advanceUntil('NIGHT');        // 또는 (s) => s.players.find(...).alive === false
const s = await t.state();            // { gameId, phase, dayIndex, dayPhase, nightTurnRole, tribunal, winResult, players:[{uuid,nickname,role,alive}] }
```

- **역할 고정**: `roles`(또는 `e2e.setRoles({ uuid: 'JOKER' })`를 시작 전에). **방 예약**: `table.setup`은 그 방 id로 예약 → 그 방 판에만 씀. `e2e.setRoles`를 직접 부르면 정할 사람 중 대기방에 든 사람의 방을 찾아 방 예약(못 찾으면 그 사람 예약 — 그 사람이 든 판에만), 15분 안 쓰면 버림. 판 시작 때 바라는 사람에게 그 역할, 나머지는 되도록 원래 역할 그대로 — **사슬 바꿈(나→경비원, 경비원이던 봇→광대)도 맞춤**. 같은 판 안에서 역할을 서로 바꿔 끼우므로 **역할별 인원은 방 설정 그대로** — 자동 구성은 6명부터 의사, 8명 경비원, 10명 마녀사냥꾼. 작은 판에서 특수 역할이 필요하면 `settings: { roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } }` (광대 수는 `jokerCount`와 같아야 함). 못 맞춘 역할은 서버 로그에 `[e2e] 역할 미리 정하기 못 맞춤`.
- **짧은 시간**: 방 설정 최소값(토론·투표·밤 30초, 재판 15초)이 기본. 그래도 기다리지 말고 **`t.advance()`/`t.advanceUntil()`로 지금 단계 마감 타이머를 바로 돌림**(시간 설정 값은 그대로라 화면 타이머 숫자 시험도 됨). 역할 공개 10초도 바로 넘김.
- **봇 행동 지정** (`t.playBots(plan)` 또는 봇마다 `(bot, i) => plan`): `dayChat`, `readyForVote`(기본 true), `dayVote`(`'random'`·`'abstain'`·`'skip'`·uuid·닉네임·함수), `tribunal`(`'GUILTY'`·`'NOT_GUILTY'`·`'skip'`=안 내서 마감 때 기권·함수), `night`(대상, 광대는 동료 빼고), `jokerChat`, `deadChat`(죽은 뒤 한 번), `pollMs`.
- **처형시키기**: 봇 `dayVote: 대상, tribunal: 'GUILTY'` → `advanceUntil(대상 alive === false)`. **밤에 죽이기**: 광대 봇을 `roles`로 정하고 `night: 대상` → `advanceUntil('DAY')`. (예: `tests/ingame/execute-by-bots.spec.js`)
- 봇 하나 직접: `t.bots[0].request('submit_game_chat_message', { gameId: t.gameId, text })`, 받은 사건 `bot.events`, `bot.waitForEvent('day_chat_message_received')`.
- 사람이 방장인 판: 화면으로 방 만들기(`tests/room/create-room.spec.js`) → `e2e.roomOf(uuid)`로 코드 얻기 → `bot.joinByCode(code)`.

### internal.js — 관리자 통로·시험 손잡이 (열쇠는 .env.e2e)

| 함수 | 무엇 |
|---|---|
| `internal.announceTo(uuids, { title, body })` | 그 사람들에게 공지 (병렬 안전) · `internal.announce(payload)`는 `target:'online'`도 됨(@serial) |
| `internal.disconnect(uuid)` | 정지·비활성 반영 즉시 끊기 |
| `internal.reloadMaintenance()` · `reloadBannedWords()` | DB 표 고친 뒤 다시 읽기 (점검은 @serial) |
| `internal.live()` | 대기방·진행 판 요약 |
| `e2e.setRoles({uuid: ROLE}, { roomId? })` · `clearRoles([uuid…])` · `clearRoles({ roomId })` | 다음 판 시작 때 역할 (방·사람 예약, 위 'game.js'). 전부 지우기는 `clearRoles({ all: true })`(남의 예약도 지우니 @serial에서만), 인자 없는 `clearRoles()`는 던짐 |
| `e2e.gameOf(uuid)` · `e2e.game(gameId)` | 판 요약 (역할·생존·단계) |
| `e2e.roomOf(uuid)` | 대기방 (코드·방장·준비) |
| `e2e.advance(gameId)` | 지금 단계 바로 끝내기 |

`/e2e/*` 경로는 백엔드가 `E2E_HOOKS=1`이고 운영이 아닐 때만 붙음(운영에 이 값이 있으면 시작 거부). 시험 백엔드는 4100에서만 켜 둠.

### mail.js — 메일 속 번호·링크

`await mail.waitForCode(email)` (가입 `SIGNUP_CODE`) · `mail.waitForCode(email, 'EMAIL_CHANGE_CODE')` · `mail.waitForResetUrl(email, { since })` · `mail.readMails(email)` · 모바일은 `mail.toMobile(resetUrl)` (링크는 데스크톱 주소로 옴). 다시 보내기 시험은 `since: Date.now()`를 누르기 전에 잡아 둠.

### ui.js — 화면 공통

`skipIntro` · `gotoLobby` · `loginViaUi` · `loginViaApi` · `joinRoomByCodeUi(page, code)` (데스크톱 6칸·모바일 1칸 둘 다) · `readyUi` · `readRoleReveal(page)` → '광대' 등 · `closePhaseNotice` · `sendChat` · `expectChat` · `captureAlert(page, action, { timeoutMs=10000, close=true })` → 알림 문구 (데스크톱 대화상자·모바일 양피지 창 둘 다, 누르기 전부터 떠 있던 양피지 창은 빼고) · `ROLE_LABELS`.

### security.js — 보안

`trapXss(page)`(goto 전에) → 넣을 글 `xssPayloads('표식')` → `assertNoXss(trap)` · `readResponse(url, init)` → `{ status, headers, setCookies, body }` · `parseSetCookie(line)` · `cookieAttributes(context)` · `loginCookie(account)` → `{ cookie }` · `openRawSocket({ cookie, origin, url })` → `{ connected, error, events, emitAck, close }`.

### servers.js — 서버

`triggerShutdown()` (깃발 파일 → 서버 안에서 SIGTERM → 접속자에게 `server_shutdown` 알림 → 꺼짐, 곧 다시 켜짐) · `waitBackendUp()` (**@shutdown 시험은 finally에서 꼭**) · `startExtraBackend({ port?, defaultIpLimits=true, overrides, expectExit, timeoutMs=60000 })` (시험 하나만 쓰는 백엔드, 같은 시험 DB·포트는 준 값 또는 4150+작업자 번호, 화면 없음). 안 켜짐(시간 초과)·바로 꺼짐으로 던질 때도 띄운 node를 끄고 던짐, 시험 프로세스가 끝나도 끔.

### toss.js — 토스 결제창

`await toss.openTossWindow(page, { product: /다이아 10개/ })` → 토스 샌드박스 iframe(읽기만) · `await toss.closeTossWindow(page)`.

### db.js · accounts.js

`require('../../helpers/db').query(sql, [값])` — 시험 DB 확인·정지 줄 넣기 등 (주소가 `joker_e2e`가 아니면 던짐). 계정 지우기는 실행 끝에 이번 실행(`E2E_RUN_ID`) 것만 자동.

- **시각은 UTC**: 앱은 DB에 UTC로 적음. 날 SQL 값에 JS `Date`를 그대로 넘기면 sequelize가 이 PC 시간대(KST)로 바꿔 **9시간 어긋남**(정지 시작이 9시간 뒤 → 정지 안 걸림, 문제목록 ingame-c E3). `query`는 넘긴 값 속 `Date`를 알아서 UTC 글자로 바꿈. 글자로 직접 만들 땐 `const { sqlTime } = require('../../helpers/db')` → `sqlTime()` 지금, `sqlTime(Date.now() + 3600e3)` 한 시간 뒤 → `'2026-11-09 03:25:51'`. SQL 안에서는 `UTC_TIMESTAMP()`·`NOW()`(연결 시간대가 +00:00이라 같음)도 됨.
- `accounts.createMany(n)`·봇 계정은 **하나씩 차례로** 만듦(동시에 만들면 가끔 DB 교착 — 문제목록 ingame-c E2), 계정 하나 만들기도 교착이면 몇 번 다시.

## 본보기 시험 (2026-11-09 전부 통과)

| 파일 | 무엇 |
|---|---|
| `tests/auth/login.spec.js` | 로그인 성공 → 로비 · 비번 틀림 → 알림 |
| `tests/auth/password-reset-mail.spec.js` | 재설정 메일 링크 열기 |
| `tests/room/create-room.spec.js` | 화면으로 방 만들기 → 대기방·방 코드 |
| `tests/ingame/role-reveal.spec.js` | 2인 판, 광대 고정 → 역할 공개 → 바로 제 1일 |
| `tests/ingame/execute-by-bots.spec.js` | 5인 판, 봇 넷이 나를 투표·유죄 → 처형 |
| `tests/ingame/server-shutdown.spec.js` | 서버 꺼짐 안내 (@shutdown, serial) |
| `tests/result/game-end.spec.js` | 2인 판 끝 → 결과 화면 |
| `tests/lobby/menu.spec.js` · `tests/mypage/open.spec.js` | 로비 메뉴 · 마이페이지 |
| `tests/store/toss-window.spec.js` | 토스 결제창 열고 닫기 |
| `tests/mobile/lobby.spec.js` | 모바일 로비 메뉴·광고 자리·가로 넘침 없음 |
| `tests/security/cookies-socket.spec.js` | 쿠키 HttpOnly·SameSite, 남의 Origin 소켓 거절, 채팅 XSS 안 돎 |

## 알려진 문제

- **새 계정 여럿이 동시에 처음 로그인하면 가끔 500** — `services/auth/account/session.js`가 같은 트랜잭션에서 `user_sessions`를 user_id로 UPDATE(빈 틈 잠금) 뒤 INSERT → 서로 다른 사람끼리 InnoDB 교착(`SHOW ENGINE INNODB STATUS`로 확인). 시험 도우미(`loginViaApi`·봇 로그인)는 500일 때만 몇 번 다시 하고 `[e2e] ... → 다시` 경고를 남김. 로그인 자체를 보는 시험은 `loginViaUi`(다시 안 함)를 씀.
- 소셜(구글·디스코드) 키는 시험 백엔드에 안 넣음 → 소셜 버튼은 누른 뒤 이동·오류 안내까지만 확인.
- 비번 재설정 링크 주소는 데스크톱(5273) → 모바일 시험은 `mail.toMobile()`.
