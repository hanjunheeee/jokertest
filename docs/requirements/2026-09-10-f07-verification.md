# F-07 Discord 로그인 — 검증 근거 및 외부 연동 미검증 기록

날짜: 2026-09-10
슬라이스: Pluto AR (F-07)

이 문서는 2026-09-10-f06-verification.md(F-06 Google)와 같은 목적의 patch 포함 추적
산출물이다. `.pluto/done.json`/`.pluto/progress.md`만 갱신하고 patch에는 반영되지 않는
방식은 F-06 재반려 사례가 이미 실패로 확인했으므로 반복하지 않는다.

## CODEX-1 재검토 지적과 이번 회차의 해결

이전 회차는 검토(CODEX-1)에서 AC-02/AC-03/AC-04/AC-05가 각각 `partial`로 반려되었다. 이번
회차가 각 지적을 어떻게 해결했는지 요약한다(세부 근거는 아래 각 절).

- **AC-02** ("테스트가 resolveOAuthAccount를 스텁하므로 실제 Discord 신규 계정 생성·가입
  완료·기존 identity 조회 근거가 필요") — `backend/tests/db/f07-discord-oauth.integration.test.js`
  (신규)를 추가했다. `f05-social-auth.integration.test.js`(F-05)가 이미 이 실행 경로 자체를
  실제 DB로 검증하지만 provider로 `'google'`/`'kakao'`만 쓰고 `'discord'`는 한 번도 쓰지
  않았다(이번 회차에 grep으로 재확인) — 새 파일은 provider `'discord'`로, 그리고
  `socialAuthService`뿐 아니라 `discordOAuthService`(fetch 목적지만 로컬 fixture로 리다이렉트,
  나머지 로직은 전혀 스텁하지 않음)와 실제 `auth.routes.js`(스텁 없음)까지 전부 실제로 태워
  신규 가입 → 가입 완료 → 재로그인(기존 identity 조회) 전 과정을 실제 `users`/
  `external_identities` 행으로 확인한다.
- **AC-03** ("discordOAuth.service.js가 이메일을 null로 반환한 뒤 공통 서비스가
  EMAIL_MISSING으로 거부하는 실행 경로와 assertion이 제공되지 않았다") — 두 층에서 보강했다.
  (1) `backend/__tests__/discordAuth.route.test.js`에 컨트롤러 계약 수준 테스트를 추가해,
  `discordOAuthService.exchangeCodeForProfile`이 `email:null`을 반환하면 컨트롤러가 그 값을
  가공하지 않고 그대로 `resolveOAuthAccount`에 넘기는지 단언한다. (2) 위 신규 DB 통합
  테스트에 실제 Discord fixture가 `verified:false`(이메일 미검증)를 반환하는 시나리오를
  추가해, `discordOAuth.service.js`가 실제로 `email:null`을 만들고 → 실제
  `socialAuthService.resolveOAuthAccount`가 실제로 `EMAIL_MISSING`으로 거부하고 → 실제 HTTP
  콜백이 세션 쿠키 없이 리다이렉트하는 전체 실행 경로를 스텁 없이 잇는다.
- **AC-04** ("auth.routes.js는 명시적 연결 라우트를 등록하지 않아 로그인 후 동의·제공자
  소유권 검증을 통한 실제 연결 경로가 충족되지 않는다") — `GET /auth/discord/link`·
  `GET /auth/discord/link/callback`을 새로 열었다(`backend/controller/user.controller.js`의
  `discordLinkStart`/`discordLinkCallback`, `backend/routes/auth.routes.js`에 `verifyToken`으로
  보호된 라우트로 등록). F-05가 이 라우트를 의도적으로 닫아 둔 이유(운영자 코드 검토
  R-IMPL — 클라이언트가 주장하는 provider/subject/email을 그대로 믿는 위험, 이전에 있던
  `POST /auth/social/link`가 바로 그 패턴이었다)는 그대로 존중한다 — 새 라우트는 `code` 외에
  다른 신원 파라미터를 아예 받지 않고, `subject`/`email`은 오직
  `discordOAuthService.exchangeCodeForProfile`이 실제 Discord 서버와 교환해 검증한 값만 쓴다.
  `socialAuthService.linkExternalIdentity`(F-05, 미수정)를 그대로 재사용해 자동 병합·이미
  연결된 identity 재사용을 막는다. 컨트롤러 계약 테스트(`discordAuth.route.test.js`)와 실제
  DB+HTTP 통합 테스트(`f07-discord-oauth.integration.test.js`) 양쪽에서 성공·미인증(401)·
  이미 연결됨(409)·취소+재사용 방지를 검증한다. Google(F-06)의 동등한 링크 라우트는 이
  슬라이스(F-07) 범위 밖이라 추가하지 않았다.
- **AC-05** ("검증 문서는 고객센터 컴포넌트와 로고만 언급하여 실제 초대 URL의 독립된 설정
  키·값 출처를 확인할 근거가 부족하다") — 재조사 결과를 아래 "AC-05" 절에 갱신했다: 로비의
  `LobbyDiscordButton.jsx`는 현재 `onClick` prop을 받는 순수 프레젠테이션 컴포넌트이고,
  호출부(`LobbyPage.jsx`)는 `<LobbyDiscordButton />`을 `onClick` 없이(기본값 `() => {}`) 렌더링한다
  — 즉 이 저장소에는 애초에 "고객센터 Discord 초대 URL" 자체가 아직 어디에도 문자열로 존재하지
  않는다(`grep -r "discord.gg\|DISCORD_INVITE\|discordInvite"` 결과 0건). OAuth 자격
  (`DISCORD_CLIENT_ID`/`SECRET`/`REDIRECT_URI`)과 공유할 "값"이 아직 코드베이스에 없으므로,
  분리 여부를 값 수준으로 비교할 대상 자체가 없다는 것이 이번 재조사의 정확한 결론이다 — 값이
  생기면(향후 슬라이스가 실제 초대 URL을 상수로 추가하면) 그 값이 이 OAuth 환경변수 세 개와
  겹치지 않는지 다시 확인해야 한다는 점을 아래에 남겨 둔다.

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
인가·토큰 교환)의 자격만 가리킨다.

CODEX-1 재검토에서 이 절이 "고객센터 컴포넌트와 로고만 언급했다"고 지적했다 — 재조사한
정확한 사실관계는 다음과 같다:

- `frontend/src/domains/lobby/components/LobbyDiscordButton.jsx`는 `onClick`을 prop으로
  받기만 하는 순수 프레젠테이션 컴포넌트다(내부에 URL을 직접 갖지 않는다).
- 유일한 호출부 `frontend/src/domains/lobby/pages/LobbyPage.jsx:48`은
  `<LobbyDiscordButton />`을 `onClick` 없이 렌더링한다 — 컴포넌트 기본값(`() => {}`)이 그대로
  쓰여 현재는 클릭해도 아무 것도 하지 않는다.
- 저장소 전체에서 `discord.gg`·`DISCORD_INVITE`·`discordInvite` 어떤 패턴으로도 실제 초대
  URL 문자열이 존재하지 않는다(grep 0건, `frontend/src/domains/lobby/constants/lobbyAssets.js`의
  `discordLogo`는 이미지 에셋 경로일 뿐 URL이 아니다).

즉 "고객센터 Discord 초대 URL"이라는 값 자체가 이 코드베이스에 아직 없다 — 그래서 OAuth
자격(`DISCORD_CLIENT_ID`/`SECRET`/`REDIRECT_URI`)과 비교해 "분리되어 있는지" 판정할 대상 값이
없다(비교할 두 값 중 하나가 존재하지 않으므로, 값 수준의 공유가 애초에 불가능하다 — 코드
구조상의 분리가 아니라 대상의 부재로 성립하는 분리다). 이 F-07 슬라이스는 로비 Discord
버튼에 실제 초대 URL을 연결하는 작업을 범위에 포함하지 않는다(승인된 수정 범위 밖 —
`frontend/src/domains/lobby/**`는 이번 슬라이스의 대상 파일 목록에 없다). 향후 어떤 슬라이스가
그 URL을 실제 값으로 추가하면, 그 값이 `DISCORD_CLIENT_ID`/`SECRET`/`REDIRECT_URI`와 겹치지
않는 별도 설정 키에 저장되는지 그 시점에 다시 확인해야 한다.

### 로컬 fixture·UI 검증과의 구분

아래는 실제 Discord 외부 인증이 **아니며**, 그렇게 주장하지 않는다.

- `backend/__tests__/discordAuth.route.test.js`(23개, AC-03 EMAIL_MISSING 컨트롤러 계약·AC-04
  링크 라우트 계약 각 4~5개 추가)·`backend/__tests__/googleAuth.route.test.js`(18개, F-07
  제공자 바인딩 회귀 1개 추가)는 `socialAuthService`/`discordOAuthService`를 스텁으로 대체한
  서버 라우트 계약 테스트다 — 실제 Discord 서버와 통신하지 않는다.
- `backend/__tests__/discordOAuth.service.test.js`(10개)는 `exchangeCodeForProfile`이 실제
  Discord 엔드포인트가 아니라 로컬 `http.createServer` fixture로 왕복하도록 `fetch` 목적지만
  바꾼 것이다 — 요청 형태(본문·헤더)와 실패·타임아웃 처리를 검증할 뿐, 실제 Discord 계정
  인증을 증명하지 않는다.
- `backend/tests/db/f07-discord-oauth.integration.test.js`(신규, 7개)는 `socialAuthService`도
  `discordOAuthService`도 스텁하지 않는다 — 실제 격리 MySQL DB + `fetch` 목적지만 로컬
  fixture로 리다이렉트한 실제 `discordOAuthService` + 스텁 없는 실제 `auth.routes.js`로 신규
  가입·가입 완료·재로그인·EMAIL_MISSING·EMAIL_CONFLICT·명시적 연결(성공/401/이미 연결됨/
  취소+재사용 방지)을 검증한다. 다만 실제 Discord 서버가 아니라 로컬 fixture와 통신하고,
  `F01_TEST_DATABASE_URL`이 없는 환경(이 세션 포함)에서는 f01~f05와 같은 원칙으로 skip되어
  "미검증"으로 남는다 — 아래 "실행한 검증" 절 참고.
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
  pass/0 fail/0 skip을 기록한 바로 그 스크립트)를 이번 회차에서도, 그리고 이번 CODEX-1
  재검토 대응 회차에서도 이 워크트리 대상으로 실행을 시도했으나, 두 번 모두 세션의 명령
  승인 절차에서 거부되어("이 명령은 승인이 필요합니다") 실행되지 못했다 — 형태를 바꿔
  우회하지 않았다. 이 스크립트가 다루는 DB 자격·대상 스키마는 운영자 전용 비공개 설정
  (`f01-test-db.private.json`)에 있으므로, 이 격리 DB 배경의 전체 회귀
  (`backend/tests/db/f07-discord-oauth.integration.test.js`의 7개를 포함해)는 운영자 또는
  정규 VERIFY 단계가 별도로 재실행해 확인해야 한다.

## 실행한 검증 (CODEX-1 재검토 대응 회차 포함)

- `node impl-check.js node-test backend/__tests__/discordOAuth.service.test.js` — **10 pass / 0 fail**.
  로컬 fixture HTTP 서버로 Discord 토큰·프로필 엔드포인트 요청 형태·실패·타임아웃 처리를 검증.
- `node impl-check.js node-test backend/__tests__/discordAuth.route.test.js` — **23 pass / 0 fail**
  (기존 17개 + AC-03 EMAIL_MISSING 계약 1개 + AC-04 링크 라우트 계약 5개 신규). 시작·콜백 라우트
  계약, state 소비 순서(R-IMPL #3), rememberMe 보존(R-IMPL #2), 취소/충돌/이메일 미제공/재사용/
  제공자 바인딩/명시적 연결 각 시나리오.
- `node impl-check.js node-test backend/tests/db/f07-discord-oauth.integration.test.js` — **0 pass
  / 0 fail / 7 skipped**(`F01_TEST_DATABASE_URL` 미설정, 이 세션에서는 f01~f06과 같은 이유로
  실제 DB 검증이 불가능하다 — 미검증으로 남는다). 구문·require 오류 없이 전부 skip 경로로
  정상 진입하는 것은 확인했다.
- `node impl-check.js node-test backend/__tests__/googleAuth.route.test.js` — **18 pass / 0 fail**
  (기존 17개 + 제공자 바인딩 회귀 1개 신규). 기존 Google 회귀가 provider 필드 추가로 깨지지
  않음을 확인.
- `node impl-check.js test`(cwd=backend) — 백엔드 전체 테스트 **1,144 pass / 0 fail / 42
  skipped**. skip은 `F01_TEST_DATABASE_URL` 미설정으로 인한 기존 DB 통합 테스트 skip(이번
  회차의 신규 f07 DB 통합 테스트 7개 포함)이며, 이번 회차가 skip을 실패로 위장하지 않았다.
- `node impl-check.js test`(cwd=frontend) — 프론트 전체 테스트 **1,228 pass / 0 fail / 0
  skipped**. `LoginPage.social.test.js`의 Discord 전용 케이스(제공자 이름 미노출 검증 포함)를
  포함한 전체 통과(이번 CODEX-1 대응 회차는 프론트 파일을 고치지 않았다 — 회귀 없음 재확인).
- `node impl-check.js build`(cwd=frontend) — production build **exit 0**.
- 수동 AC-05는 OAuth 설정과 고객센터 초대 URL이 분리된 별도 값인지 재조사한 조건이다(위
  "AC-05" 절 — 재조사 결과 초대 URL 값 자체가 아직 코드베이스에 없다는 것을 확인했다). 실제
  Discord 인증 성공을 수동 PASS로 대체한 것이 아니다.

로그 경로는 이번 회차의 `.pluto/progress.md` 기록에 남긴다.

## 복구 절차

아래 파일만 고쳤다(처음 구현 회차 + CODEX-1 재검토 대응 회차 누계) — 롤백이 필요하면 이
목록을 이전 커밋 상태로 되돌리면 된다. 스키마 변경은 없다(`oauth_states`/
`social_signup_intents`/`external_identities` 테이블 구조 변경 없음 — provider 바인딩은 DB가
아니라 서버 서명 쿠키(JWT) payload에만 추가되었고, 명시적 연결(link)도 F-05가 이미 만들어 둔
`external_identities`/`oauth_states` 스키마와 `linkExternalIdentity`/
`issueOAuthState(purpose:"link")` 함수를 그대로 재사용한다 — 새 라우트만 추가되었다).

- `backend/service/discordOAuth.service.js` (신규, 처음 구현 회차)
- `backend/controller/user.controller.js` (처음 구현 회차 + CODEX-1 대응: `discordLinkStart`/
  `discordLinkCallback` 추가)
- `backend/routes/auth.routes.js` (처음 구현 회차 + CODEX-1 대응: `GET /auth/discord/link`·
  `GET /auth/discord/link/callback` 등록)
- `backend/__tests__/discordAuth.route.test.js` (신규, 처음 구현 회차 + CODEX-1 대응: AC-03
  EMAIL_MISSING·AC-04 링크 라우트 테스트 추가)
- `backend/__tests__/discordOAuth.service.test.js` (신규, 처음 구현 회차)
- `backend/__tests__/googleAuth.route.test.js` (처음 구현 회차)
- `backend/tests/db/f07-discord-oauth.integration.test.js` (신규, CODEX-1 대응 회차 — AC-02/
  AC-03/AC-04 실제 DB 증거)
- `frontend/src/domains/auth/components/LoginForm/SocialLoginButtons.jsx` (처음 구현 회차)
- `frontend/src/domains/auth/components/SocialSignupForm.jsx` (처음 구현 회차)
- `frontend/src/domains/auth/hooks/useLoginPage.js` (처음 구현 회차)
- `frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js` (처음 구현 회차)
- `docs/requirements/2026-09-10-f07-verification.md` (본 문서, 처음 구현 회차 신규 + CODEX-1
  대응 회차 갱신)
