# F-07 Discord 로그인 — 검증 근거 및 외부 연동 미검증 기록

날짜: 2026-09-10
슬라이스: Pluto AR (F-07)

이 문서는 2026-09-10-f06-verification.md(F-06 Google)와 같은 목적의 patch 포함 추적
산출물이다. `.pluto/done.json`/`.pluto/progress.md`만 갱신하고 patch에는 반영되지 않는
방식은 F-06 재반려 사례가 이미 실패로 확인했으므로 반복하지 않는다.

## AC-05 — 실제 Discord 외부 연동은 readiness_unverified

이 슬라이스는 실제 Discord 클라이언트 ID·비밀키·등록된 redirect_uri를 받은 적이 없다.
그 결과 아래 세 시나리오는 실제 Discord 계정으로 실행한 근거가 없고, `readiness_unverified`로
남긴다.

- **최초 로그인(신규 Discord 계정)** — readiness_unverified.
- **재로그인(이미 연결된 Discord 계정)** — readiness_unverified.
- **취소(Discord 동의 화면에서 사용자가 취소)** — readiness_unverified.

### 실제 연동에 필요한 것 (서버 환경변수 이름만, 값은 기록하지 않음)

`backend/service/discordOAuth.service.js`의 `readRequiredEnv`가 호출 시점에 아래 이름을
읽는다 — 이름만 여기 남기고 실제 값(비밀키 등)은 어디에도 기록하지 않는다.

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI` (Discord Developer Portal에 등록된 콜백 URL과 정확히 일치해야 함)
- `DISCORD_OAUTH_TIMEOUT_MS` (선택, 기본 8000ms — 제공자 응답 타임아웃)

필수 세 값(ID·비밀키·콜백 URL)이 실제로 채워지고, `DISCORD_REDIRECT_URI`가 Discord
Developer Portal에 등록된 콜백과 일치하는 배포 환경에서 사람이 브라우저로 최초/재로그인/취소
세 시나리오를 직접 눌러 확인해야 위 readiness_unverified 상태가 검증됨으로 바뀐다. 이
저장소의 어떤 자동 테스트도 이 조건을 대신 만족시키지 않는다.

### AC-05 — OAuth 앱 설정과 고객센터 초대 URL은 분리된 별도 설정 값이다

`DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI`는 오직
`discordOAuth.service.js`의 `readRequiredEnv`만 읽으며, 이 세 값은 Discord OAuth 앱(로그인
인가·토큰 교환)의 자격만 가리킨다. 저장소 안에서 이미 존재하는 고객센터 Discord 초대 버튼
(`frontend/src/domains/lobby/components/LobbyDiscordButton.jsx`, 로비 화면)은 별도 도메인
(lobby)의 UI 컴포넌트로, 이번 F-07 변경 범위 밖이며 이 OAuth 환경변수를 전혀 참조하지 않는다
— 두 설정은 코드 구조상으로도 서로 다른 파일·다른 값으로 완전히 분리되어 있다. `grep -ri
discord` 결과 OAuth 자격과 고객센터 버튼 자산(`lobbyAssets.js`의 `discordLogo`) 사이에 값
공유가 없음을 확인했다(수동 확인, 자동 테스트 아님).

### 로컬 fixture·UI 검증과의 구분

아래는 실제 Discord 외부 인증이 **아니며**, 그렇게 주장하지 않는다.

- `backend/__tests__/discordAuth.route.test.js`(17개)·`backend/__tests__/googleAuth.route.test.js`(18개,
  F-07 제공자 바인딩 회귀 1개 추가)는 `socialAuthService`/`discordOAuthService`를 스텁으로
  대체한 서버 라우트 계약 테스트다 — 실제 Discord 서버와 통신하지 않는다.
- `backend/__tests__/discordOAuth.service.test.js`(10개)는 `exchangeCodeForProfile`이 실제
  Discord 엔드포인트가 아니라 로컬 `http.createServer` fixture로 왕복하도록 `fetch` 목적지만
  바꾼 것이다 — 요청 형태(본문·헤더)와 실패·타임아웃 처리를 검증할 뿐, 실제 Discord 계정
  인증을 증명하지 않는다.
- `frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js`에 추가한 Discord 관련
  케이스는 `mapSocialErrorCode`가 순수 함수로서 코드→문구 매핑을 올바르게 하는지만 검증한다 —
  화면 렌더링이나 실제 리다이렉트 왕복을 검증하지 않는다.

## 이번 회차의 설계 변경 — 제공자 바인딩(provider binding)

F-05/F-06이 설계한 `oauthAttempt` 서명 쿠키(state에 결합되는 browserFingerprint와 rememberMe
선택을 보존)는 제공자를 구분하지 않았다 — `socialAuth.service.js`의 state 자체도 `purpose`만
검사하고 provider는 검사하지 않는다. F-07이 두 번째 제공자를 추가하면서, 한 제공자로 시작한
로그인 시도의 서명된 쿠키(및 그 쿠키가 실어온 fp)를 다른 제공자의 콜백 라우트에 그대로
들이밀 수 있는 경로가 새로 생겼다. `user.controller.js`의 `signOAuthAttempt` payload에
`provider`("google" | "discord")를 추가하고, `googleAuthCallback`/`discordAuthCallback` 각각
자신의 provider와 정확히 일치하는 쿠키만 fp·rememberMe의 출처로 신뢰하도록 고쳤다 — 불일치
하면 fp가 undefined가 되어 기존 STATE_MISSING 경로로 자연스럽게 거부된다.

이 변경의 회귀 안전성은 두 라우트 테스트 파일 양쪽에서 직접 검증한다:
- `googleAuth.route.test.js`: "Discord 시작 시도의 oauthAttempt 쿠키(provider:discord)는
  Google 콜백에서 fp 없이 취급되어 Google을 부르지 않는다."
- `discordAuth.route.test.js`: "Google 시작 시도의 oauthAttempt 쿠키(provider:google)는
  Discord 콜백에서 fp 없이 취급되어 Discord를 부르지 않는다."

기존 `googleAuth.route.test.js`의 `loginAttemptCookie` 헬퍼는 `provider` 기본값을 "google"로
두어, provider 필드 추가 이전의 기존 17개 테스트를 그대로 통과시킨다(회귀 없음).

## 공유 UI·문구 — Google 전용 표현 제거

- `frontend/src/domains/auth/hooks/useLoginPage.js`의 `SOCIAL_ERROR_MESSAGES`: `OAUTH_CANCELLED`/
  `EMAIL_MISSING`/`PROVIDER_INVALID`는 F-05 공통 코드로 Google·Discord 양쪽에서 날 수 있는데,
  기존 문구가 "Google 로그인을 취소했습니다" 등으로 제공자를 못박고 있었다 — Discord 실패에
  잘못된 안내가 붙는 것을 막기 위해 제공자 이름을 뺀 문구로 고쳤다. `GOOGLE_*`/`DISCORD_*`
  접두 코드(각 제공자 어댑터 전용)는 그대로 제공자 이름을 명시한다. `DISCORD_OAUTH_NOT_CONFIGURED`/
  `DISCORD_CODE_MISSING`/`DISCORD_TOKEN_EXCHANGE_FAILED`/`DISCORD_PROFILE_FETCH_FAILED`/
  `DISCORD_PROFILE_INVALID`/`DISCORD_OAUTH_TIMEOUT` 6개를 새로 추가했다.
- `frontend/src/domains/auth/components/SocialSignupForm.jsx`의 가입 보완 안내 문구를 "Google
  계정으로 처음 오셨네요"에서 "소셜 계정으로 처음 오셨네요"로 고쳤다 — intentToken은 프론트
  입장에서 불투명한 값이라 어느 제공자였는지 알 수 없고, Discord로 온 신규 가입자에게 Google
  문구를 보여주는 것은 오도(misleading)다.
- `frontend/src/domains/auth/components/LoginForm/SocialLoginButtons.jsx`의 Discord 버튼에
  `onClick`을 연결했다(`GET /auth/discord?rememberMe=...`로 전체 페이지 이동) — 이전에는
  Google만 동작하고 Discord 버튼은 아무 동작이 없었다.

## AC-06 — 실제 제공자 연동 검증 미실행 항목 (명시 기록)

이 슬라이스는 실제 Discord 앱 키·등록된 콜백 URL을 받지 못했다. 그 결과 아래 항목은 이번
회차에서 실행하지 못했고, `미검증`으로 남긴다 — 완료로 주장하지 않는다.

- 실제 Discord 계정으로 브라우저 전체 왕복(버튼 클릭 → Discord 동의 화면 → 콜백 → 세션/가입
  보완)을 수행한 적이 없다.
- 실제 Discord 계정으로 신규 가입·재로그인·취소·이메일 미제공·이메일 충돌 각 시나리오를
  재현한 적이 없다.
- `node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs`(F-01 승인된 격리 MySQL
  스키마를 사용하는 백엔드 전체 회귀 래퍼, F-06 회차에서 운영자가 직접 실행해 1145
  pass/0 fail/0 skip을 기록한 바로 그 스크립트)를 이번 회차에서도 이 워크트리 대상으로
  실행을 시도했으나, 세션의 명령 승인 절차에서 거부되어("이 명령은 승인이 필요합니다")
  실행되지 못했다 — 형태를 바꿔 우회하지 않았다. 이 스크립트가 다루는 DB 자격·대상 스키마는
  운영자 전용 비공개 설정(`f01-test-db.private.json`)에 있으므로, 이 격리 DB 배경의 전체
  회귀는 운영자 또는 정규 VERIFY 단계가 별도로 재실행해 확인해야 한다.

## 실행한 검증 (이번 회차)

- `node impl-check.js node-test backend/__tests__/discordOAuth.service.test.js` — **10 pass / 0 fail**.
  로컬 fixture HTTP 서버로 Discord 토큰·프로필 엔드포인트 요청 형태·실패·타임아웃 처리를 검증.
- `node impl-check.js node-test backend/__tests__/discordAuth.route.test.js` — **17 pass / 0 fail**.
  시작·콜백 라우트 계약, state 소비 순서(R-IMPL #3), rememberMe 보존(R-IMPL #2), 취소/충돌/
  재사용/제공자 바인딩 각 시나리오.
- `node impl-check.js node-test backend/__tests__/googleAuth.route.test.js` — **18 pass / 0 fail**
  (기존 17개 + 제공자 바인딩 회귀 1개 신규). 기존 Google 회귀가 provider 필드 추가로 깨지지
  않음을 확인.
- `node impl-check.js test`(cwd=backend) — 백엔드 전체 테스트 **1,138 pass / 0 fail / 35
  skipped**. skip은 `F01_TEST_DATABASE_URL` 미설정으로 인한 기존 DB 통합 테스트 skip이며(F-06
  문서가 기록한 것과 같은 패턴), 이번 회차가 새로 skip을 늘리지 않았다.
- `node impl-check.js test`(cwd=frontend) — 프론트 전체 테스트 **1,228 pass / 0 fail / 0
  skipped**. `LoginPage.social.test.js`의 Discord 전용 케이스(제공자 이름 미노출 검증 포함)를
  포함한 전체 통과.
- `node impl-check.js build`(cwd=frontend) — production build **exit 0**.
- 수동 AC-05는 OAuth 설정과 고객센터 초대 URL이 분리되어 있는지, 외부 연동을 미검증으로
  기록했는지 확인한 조건이다. 실제 Discord 인증 성공을 수동 PASS로 대체한 것이 아니다.

로그 경로는 이번 회차의 `.pluto/progress.md` 기록에 남긴다.

## 복구 절차

이번 회차는 아래 파일만 고쳤다 — 롤백이 필요하면 이 목록을 이전 커밋 상태로 되돌리면 된다.
스키마 변경은 없다(`oauth_states`/`social_signup_intents`/`external_identities` 테이블 구조
변경 없음 — provider 바인딩은 DB가 아니라 서버 서명 쿠키(JWT) payload에만 추가되었다).

- `backend/service/discordOAuth.service.js` (신규)
- `backend/controller/user.controller.js`
- `backend/routes/auth.routes.js`
- `backend/__tests__/discordAuth.route.test.js` (신규)
- `backend/__tests__/discordOAuth.service.test.js` (신규)
- `backend/__tests__/googleAuth.route.test.js`
- `frontend/src/domains/auth/components/LoginForm/SocialLoginButtons.jsx`
- `frontend/src/domains/auth/components/SocialSignupForm.jsx`
- `frontend/src/domains/auth/hooks/useLoginPage.js`
- `frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js`
- `docs/requirements/2026-09-10-f07-verification.md` (본 문서, 신규)
