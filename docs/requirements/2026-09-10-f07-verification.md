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

## CODEX-2 재검토 지적과 이번 회차(R-IMPL 복구)의 해결

이전 회차(CODEX-1 대응) 제출 이후, 실제 VERIFY-10(격리 DB 배경 전체 회귀)과 새 코드 검토
(CODEX-2)에서 아래 결함이 확인되어 반송되었다. 이번 회차는 그 결함들만 좁게 고쳤다 — 무변경
반복이나 범위 축소 없이, 이전에 빠져 있던 UI·설정 범위도 함께 채웠다.

1. **VERIFY-10 실측(라벨: VERIFY-10)**: 1185 pass / 1 fail / 0 skip. 실패는
   `f07-discord-oauth.integration.test.js:225`의 가입 완료 assertion이 HTTP 400으로 실패한
   것 — 원인은 가입 완료 닉네임(`f07가입${subject.slice(-6)}`, 11자)이 승인된 닉네임 상한
   (2~8자, `backend/validation/signupValidation.js` `NICKNAME_MAX_LENGTH`)을 넘겨 서버 검증에
   막힌 것이었다(권한·MySQL 문제가 아니라 fixture 결함). 이번 회차는 닉네임을 `f0` + subject
   뒤 6자(항상 8자, 2~8자 규칙 안)로 고치고, 예상 밖 상태코드에는 응답 본문을 실어 진단할 수
   있게 했으며, 콜백이 SIGNUP_REQUIRED에서 다시 세팅하는 서명된 가입 보완 쿠키를 실제로 완료
   요청까지 들고 가 rememberMe:false/true 양쪽과 "닉네임 검증 실패 후 같은 쿠키로 재시도해도
   rememberMe가 조용히 사라지지 않는지"까지 검증하도록 확장했다(`f07-discord-oauth.integration.test.js`
   AC-02 테스트). 이 결함이 실제로 해소됐는지는 이 세션 권한으로 재확인하지 못했다 — 아래
   "실행한 검증"·"AC-06" 절 참고, 격리 DB 배경 최종 재실행이 필요하다.
2. **연결(link) 경로 단절**: `discordLinkStart`가 부르는 `buildAuthorizationUrl(state)`가
   로그인과 같은 `DISCORD_REDIRECT_URI`를 하드코딩해, 실제 Discord는 그 한 콜백으로만 돌려주므로
   `/auth/discord/callback`(로그인 콜백, `purpose:link`를 올바르게 거부한다)으로 떨어졌다 —
   기존 테스트는 `/auth/discord/link/callback`을 직접 호출해 이 결함을 놓쳤다. 이번 회차는
   `DISCORD_LINK_REDIRECT_URI`를 새 환경변수로 도입해, `discordOAuth.service.js`의
   `buildAuthorizationUrl`/`exchangeCodeForProfile` 둘 다 `purpose`("login" | "link") 인자로
   읽을 redirect_uri를 고르게 했다(OAuth 명세상 인가 URL 발급과 토큰 교환은 반드시 같은
   redirect_uri를 써야 한다 — 하나의 `resolveRedirectUri` 헬퍼로 두 값이 어긋날 여지를
   없앴다). `f07-discord-oauth.integration.test.js`의 링크 테스트는 이제 연결 시작이 실제로
   내보낸 `redirect_uri`를 URL에서 직접 읽어 `DISCORD_LINK_REDIRECT_URI`와 같은지, 로그인용
   `DISCORD_REDIRECT_URI`와는 다른지 확인하고, 로컬 mock Discord 서버가 실제로 받은 토큰 교환
   요청 본문의 `redirect_uri`가 그 값과 정확히 같은지까지 검증한다(더 이상 콜백을 직접
   호출하는 대신, 시작이 emit한 값을 그대로 따라간다). 두 콜백(로그인=`DISCORD_REDIRECT_URI`,
   연결=`DISCORD_LINK_REDIRECT_URI`)은 Discord Developer Portal에 각각 등록되어야 한다는 점을
   "실제 연동에 필요한 것" 절에 남긴다.
3. **state 소비 순서**: `discordLinkCallback`이 코드 교환(`exchangeCodeForProfile`)을 먼저
   부르고 나서야 `linkExternalIdentity`가 state를 소비했다 — 위조/불일치/만료/재사용 state도
   일단 Discord 네트워크 호출까지 가고 나서야 거부됐다. 이번 회차는 로그인 콜백(R-IMPL #3)과
   같은 순서로 맞췄다: state 소비와 "지금 인증된 사용자/세션과 일치하는지" 바인딩 확인을
   Discord를 부르기 전에 먼저, 그리고 독립적으로 커밋한다(`socialAuthService.consumeOAuthState`
   직접 호출). 기존 `socialAuthService.linkExternalIdentity`(rawState를 받아 그 안에서 직접
   소비하는 계약, F-05 `f05-social-auth.integration.test.js`가 그대로 검증하며 이번 회차가
   수정하지 않음)는 그대로 남기고, 그 위에서 "state 소비가 끝난 뒤"의 절차(현재 세션 재확인 →
   identity 조회/생성)만 떼어낸 `linkExternalIdentityForValidatedSession`을 새로 공개해
   컨트롤러가 이미 커밋한 state를 또 소비하지 않게 했다(이중 소비를 피하려고 옛 계약을 억지로
   재사용하지 않았다). 취소·실패는 모두 Discord를 부르기 전에 거부되고, 세션 불일치도 별도
   오류(`STATE_USER_MISMATCH`)로 제공자 호출 전에 거부된다 — `discordAuth.route.test.js`와
   `f07-discord-oauth.integration.test.js` 양쪽에 이 순서·거부를 고정하는 케이스를 추가했다.
4. **접근 가능한 UI 부재**: 링크 HTTP 엔드포인트만으로는 "명시적 사용자 행동"이 아니었다 —
   실제 화면 컨트롤이 없었다. 이번 회차는 인증된 `AccountPage`에 `DiscordAccountLink` 컴포넌트를
   새로 추가했다(`frontend/src/domains/user/components/DiscordAccountLink.jsx`,
   `AccountPanel.jsx`에 배치). `window.confirm`으로 실제 Discord 동의 화면 이동 전에 명시적
   확인을 한 번 더 받고(이 저장소에 이미 있는 되돌리기 어려운 동작 확인 패턴과 같다), 연결
   시작은 `GET /auth/discord/link`로의 전체 페이지 이동이다. 콜백(`discordLinkCallback`)의
   리다이렉트 목적지를 기존 `/lobby`(아무도 그 쿼리를 읽지 않던 곳)에서 이 흐름이 실제로
   시작된 `/account`로 바꿔, `DiscordAccountLink.jsx`가 `socialLinkSuccess`/`socialLinkError`
   쿼리를 읽어 성공/취소/실패 메시지를 보여주고 곧바로 그 쿼리를 지운다(새로고침·뒤로가기로
   메시지가 재현되지 않는다). 순수 메시지 판정 로직은 `useDiscordAccountLink.js`로 분리해
   같은 이름의 `__tests__/useDiscordAccountLink.test.js`(node:test)로 검증한다 — JSX는 이
   저장소의 node:test로 직접 렌더링할 수 없다(`useLoginPage.js`의 `mapSocialErrorCode`/
   `resolveSocialLoginView`와 같은 경계 분리). 실제 Discord 키가 없어 버튼을 눌러 실제 왕복까지
   확인하지는 못했지만(AC-06 그대로 유지), 화면 자체는 이번 회차가 추가했다 — 다음 슬라이스로
   미루지 않았다.
5. **AC-05 부재 증명 → 실제 구현**: 이전 회차의 AC-05는 "값이 없어서 비교할 수 없다"는 부재
   증명이었다 — 비교 대상이 될 독립 설정 값 자체가 코드베이스에 없었다. 이번 회차는
   `frontend/src/shared/env.js`에 `VITE_DISCORD_SUPPORT_URL`을 새로 도입하고,
   `frontend/src/shared/discordSupport.js`의 `resolveDiscordSupportUrl`이 그 원시 값을
   검증한다 — 미설정은 "사용 불가"로 취급하고(초대 URL을 추측해 채우지 않는다), `https:`가
   아닌 스킴과 Discord 초대 도메인(`discord.gg`/`discord.com`/`www.discord.com`)이 아닌
   목적지는 거부한다(피싱 목적지 차단). 백엔드 OAuth 자격(`DISCORD_CLIENT_ID`/
   `DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI`/`DISCORD_LINK_REDIRECT_URI`)과는 이름·값
   출처가 완전히 분리된 별도 설정이다(서버 전용 vs `VITE_` 접두 공개 값). F18이 로비 Discord
   버튼(`LobbyDiscordButton.jsx`)에 이 값을 연결할 예정이며, 이번 슬라이스는 그 버튼을 새로
   연결하거나 재설계하지 않는다(`frontend/src/domains/lobby/**`는 승인된 수정 범위 밖). 서버
   비밀값은 이 문서를 포함해 어디에도 값 자체를 기록하지 않는다.
6. **검증 문서 갱신**: 이 문서를 이번 회차(이하 "R-IMPL 복구 회차")의 실제 근거로 갱신했다.
   이전 회차 수치는 "VERIFY-10 실측"으로 이번 회차 수치와 구분해 표기한다(아래 "실행한 검증").
   실제 Discord 앱 키·콜백 미준비로 미실행인 항목은 AC-06에 그대로 유지한다. 격리 DB 배경
   전체 회귀(`run-backend-tests.cjs`)는 이번 회차에서도 세션 명령 승인 절차에서 거부되어
   실행하지 못했다 — 형태를 바꿔 우회하지 않고 아래 "실행한 검증"에 정확히 기록했다. 정규
   VERIFY 단계의 재실행이 필요하다.

## AC-05 — 실제 Discord 외부 연동은 readiness_unverified

이 슬라이스는 실제 Discord 클라이언트 ID·비밀키·등록된 redirect_uri를 받은 적이 없다.
그 결과 아래 세 시나리오는 실제 Discord 계정으로 실행한 근거가 없고, `readiness_unverified`로
남긴다.

- **최초 로그인(신규 Discord 계정)** — readiness_unverified.
- **재로그인(이미 연결된 Discord 계정)** — readiness_unverified.
- **취소(Discord 동의 화면에서 사용자가 취소)** — readiness_unverified.
- **명시적 연결(AccountPage의 DiscordAccountLink 버튼 → 실제 Discord 동의 → 연결 성공)**
  (R-IMPL 복구 회차 신규 시나리오) — readiness_unverified. 화면 컨트롤과 서버 라우트·상태
  검증 순서는 이번 회차가 로컬 fixture·격리 DB로 검증했지만, 실제 Discord 계정·등록된
  `DISCORD_LINK_REDIRECT_URI`로 버튼을 눌러 왕복한 적은 없다.

### 실제 연동에 필요한 것 (서버 환경변수 이름만, 값은 기록하지 않음)

`backend/service/discordOAuth.service.js`의 `readRequiredEnv`가 호출 시점에 아래 이름을
읽는다 — 이름만 여기 남기고 실제 값(비밀키 등)은 어디에도 기록하지 않는다.

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI` — **로그인** 콜백. Discord Developer Portal에 등록된 콜백 URL과
  정확히 일치해야 함(예: `https://<backend>/auth/discord/callback`).
- `DISCORD_LINK_REDIRECT_URI` (R-IMPL 복구 회차 신규) — **로그인 후 명시적 연결** 전용 콜백.
  위 로그인용과 반드시 다른 값으로 Discord Developer Portal에 별도 등록해야 한다(예:
  `https://<backend>/auth/discord/link/callback`) — 같은 값을 쓰면 연결 시작도 실제 Discord가
  로그인 콜백으로만 돌려주므로, 로그인 콜백이 `purpose:link`를 올바르게 거부해 연결이 항상
  실패한다.
- `DISCORD_OAUTH_TIMEOUT_MS` (선택, 기본 8000ms — 제공자 응답 타임아웃)

필수 값들이 실제로 채워지고, 두 `DISCORD_*_REDIRECT_URI`가 Discord Developer Portal에 각각
등록된 콜백과 일치하는 배포 환경에서 사람이 브라우저로 최초 로그인/재로그인/취소/명시적 연결
네 시나리오를 직접 눌러 확인해야 위 readiness_unverified 상태가 검증됨으로 바뀐다. 이
저장소의 어떤 자동 테스트도 이 조건을 대신 만족시키지 않는다.

### AC-05 — OAuth 앱 설정과 고객센터 초대 URL은 분리된 별도 설정 값이다(R-IMPL 복구 회차: 실제 구현)

`DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI`/`DISCORD_LINK_REDIRECT_URI`는
오직 `backend/service/discordOAuth.service.js`의 `readRequiredEnv`만 읽으며, 이 값들은 Discord
OAuth 앱(로그인 인가·토큰 교환·명시적 연결)의 자격만 가리킨다. 이 값들은 서버 전용이며 어떤
프런트엔드 번들에도 포함되지 않는다.

CODEX-1 재검토에서는 "고객센터 컴포넌트와 로고만 언급했다"는 지적이 있었고, 그 재조사 결과
(이전 회차)는 "비교할 초대 URL 값 자체가 코드베이스에 없다"는 부재 증명이었다. CODEX-2
재검토는 이 부재 증명을 "실제 독립 설정 값 자체가 없다"는 결함으로 재확인했다 — 이번 회차는
그 값을 실제로 도입했다:

- `frontend/src/shared/env.js`에 `VITE_DISCORD_SUPPORT_URL`을 새로 추가했다(`import.meta.env`를
  그대로 노출하는 기존 `API_BASE_URL`과 같은 패턴).
- `frontend/src/shared/discordSupport.js`의 `resolveDiscordSupportUrl(rawValue)`가 그 원시
  값을 검증하는 순수 함수다: 미설정(`undefined`/빈 문자열)은 `null`(사용 불가)로 취급하고
  — 값을 추측해 채우지 않는다 — `https:`가 아닌 스킴(`http:`/`javascript:` 등)과 Discord
  초대 도메인(`discord.gg`/`discord.com`/`www.discord.com`)이 아닌 목적지는 모두 `null`로
  거부한다(피싱 목적지 차단). `frontend/src/shared/__tests__/discordSupport.test.js`(7개)가
  이 규칙을 고정한다.
- 이 값은 이름(`VITE_DISCORD_SUPPORT_URL`)도 값 출처(프런트 전용 공개 설정)도 위 OAuth 자격
  네 개(서버 전용 비밀값)와 완전히 분리되어 있다 — 이제는 코드 구조상의 분리이지, 대상의
  부재로 성립하는 분리가 아니다.
- `frontend/src/domains/lobby/components/LobbyDiscordButton.jsx`(호출부
  `LobbyPage.jsx:48`)는 여전히 `onClick` 없이 렌더링되어 클릭해도 아무 동작이 없다 — 이번
  회차는 이 버튼을 새로 연결하거나 재설계하지 않는다(`frontend/src/domains/lobby/**`는 승인된
  수정 범위 밖, 지시대로 F18이 이 검증 헬퍼를 소비해 버튼을 연결·교체할 예정이다).
- 실제 고객센터 Discord 초대 URL 값 자체(`VITE_DISCORD_SUPPORT_URL`의 실제 값)는 아직 배포
  환경에 설정된 적이 없다 — 이 슬라이스는 검증 가능한 설정 경로만 만들었을 뿐, 실제 값을
  운영에 채우는 것은 범위 밖이다.

### 로컬 fixture·UI 검증과의 구분

아래는 실제 Discord 외부 인증이 **아니며**, 그렇게 주장하지 않는다.

- `backend/__tests__/discordAuth.route.test.js`(24개, R-IMPL 복구 회차: link 콜백이 state를
  코드 교환보다 먼저 소비하는 순서·STATE_USER_MISMATCH 신규 케이스 반영)·
  `backend/__tests__/googleAuth.route.test.js`(18개)는 `socialAuthService`/
  `discordOAuthService`를 스텁으로 대체한 서버 라우트 계약 테스트다 — 실제 Discord 서버와
  통신하지 않는다.
- `backend/__tests__/discordOAuth.service.test.js`(13개, R-IMPL 복구 회차: purpose:link
  redirect_uri 분리 검증 3개 추가)는 `exchangeCodeForProfile`/`buildAuthorizationUrl`이 실제
  Discord 엔드포인트가 아니라 로컬 `http.createServer` fixture로 왕복하도록 `fetch` 목적지만
  바꾼 것이다 — 요청 형태(본문·헤더·redirect_uri)와 실패·타임아웃 처리를 검증할 뿐, 실제
  Discord 계정 인증을 증명하지 않는다.
- `backend/tests/db/f07-discord-oauth.integration.test.js`(8개, R-IMPL 복구 회차: 닉네임
  fixture 수정 + rememberMe true/false 두 케이스로 분리 + link redirect_uri 추적 assertion
  추가)는 `socialAuthService`도 `discordOAuthService`도 스텁하지 않는다 — 실제 격리 MySQL DB +
  `fetch` 목적지만 로컬 fixture로 리다이렉트한 실제 `discordOAuthService` + 스텁 없는 실제
  `auth.routes.js`로 신규 가입·가입 완료(rememberMe 양쪽 + 재시도)·재로그인·EMAIL_MISSING·
  EMAIL_CONFLICT·명시적 연결(성공+redirect_uri 일치/401/이미 연결됨/취소+재사용 방지)을
  검증한다. 다만 실제 Discord 서버가 아니라 로컬 fixture와 통신하고, `F01_TEST_DATABASE_URL`이
  없는 환경(이 세션 포함)에서는 f01~f06과 같은 원칙으로 skip되어 "미검증"으로 남는다 — 아래
  "실행한 검증" 절 참고.
- `frontend/src/domains/user/hooks/__tests__/useDiscordAccountLink.test.js`(R-IMPL 복구 회차
  신규, 6개)는 `resolveDiscordLinkMessage`/`mapDiscordLinkErrorCode`가 순수 함수로서
  socialLinkSuccess/socialLinkError 쿼리를 화면 메시지로 올바르게 번역하는지만 검증한다 —
  화면 렌더링이나 실제 리다이렉트 왕복을 검증하지 않는다(DiscordAccountLink.jsx는 JSX라 이
  저장소의 node:test로 직접 렌더링할 수 없다).
- `frontend/src/shared/__tests__/discordSupport.test.js`(R-IMPL 복구 회차 신규, 7개)는
  `resolveDiscordSupportUrl`의 검증 규칙(미설정=사용 불가, 안전하지 않은 스킴/도메인 거부)만
  고정한다 — 실제 Discord 초대 링크로의 이동을 검증하지 않는다.
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
  pass/0 fail/0 skip을 기록한 바로 그 스크립트, VERIFY-10에서는 1185 pass/1 fail/0 skip을
  기록했다)를 이번 R-IMPL 복구 회차를 포함해 이 워크트리 대상으로 세 차례 실행을 시도했으나,
  매번 세션의 명령 승인 절차에서 거부되어("이 명령은 승인이 필요합니다") 실행되지 못했다 —
  형태를 바꿔 우회하지 않았다. 이 스크립트가 다루는 DB 자격·대상 스키마는 운영자 전용 비공개
  설정(`f01-test-db.private.json`)에 있으므로, 이 격리 DB 배경의 전체 회귀(닉네임 fixture를
  고친 `backend/tests/db/f07-discord-oauth.integration.test.js`의 8개를 포함해)는 운영자 또는
  정규 VERIFY 단계가 별도로 재실행해 확인해야 한다 — VERIFY-10이 잡아낸 실패(닉네임 fixture
  결함)가 이번 회차의 수정으로 실제로 해소됐는지는 아직 이 세션 권한으로 재확인하지 못했다.

## 실행한 검증

### 이전 회차 수치 (참고, 라벨로 구분)

- CODEX-1 대응 회차: `discordAuth.route.test.js` 23 pass, `discordOAuth.service.test.js` 10 pass,
  `googleAuth.route.test.js` 18 pass, 백엔드 전체 1,144 pass/0 fail/42 skipped, 프론트 전체
  1,228 pass/0 fail/0 skipped, build exit 0.
- VERIFY-10 실측(격리 DB 배경, 운영자 재실행): **1185 pass / 1 fail / 0 skip** — 실패 1건은
  `f07-discord-oauth.integration.test.js:225`(닉네임 fixture 결함, 위 "CODEX-2 재검토 지적" 1번
  참고).

### 이번 회차(R-IMPL 복구) 실측

- `node impl-check.js node-test backend/__tests__/discordAuth.route.test.js` — **24 pass / 0
  fail**(기존 23개 + link 콜백 STATE_USER_MISMATCH 신규 1개; 기존 link 성공/취소 케이스는 새
  state-소비-우선 순서에 맞춰 수정). state 소비 순서(R-IMPL #3)가 링크 콜백에서도 코드 교환보다
  먼저 커밋되는지, purpose:link로 `buildAuthorizationUrl`/`exchangeCodeForProfile`을 부르는지
  검증.
- `node impl-check.js node-test backend/__tests__/discordOAuth.service.test.js` — **13 pass / 0
  fail**(기존 10개 + purpose:link redirect_uri 분리 신규 3개). `DISCORD_LINK_REDIRECT_URI`가
  없으면 link 인가 URL 생성이 로그인용 값으로 대체되지 않고 설정 오류로 거부되는지, 실제 토큰
  교환 요청 본문의 redirect_uri가 로그인/연결에 따라 정확히 갈리는지 검증.
- `node impl-check.js node-test backend/tests/db/f07-discord-oauth.integration.test.js` — **0
  pass / 0 fail / 8 skipped**(`F01_TEST_DATABASE_URL` 미설정, 이 세션에서는 f01~f06과 같은
  이유로 실제 DB 검증이 불가능하다 — 미검증으로 남는다). 구문·require 오류 없이 전부 skip
  경로로 정상 진입하는 것은 확인했다(AC-02가 rememberMe false/true 두 케이스로 나뉘어 7개→8개).
- `node impl-check.js node-test backend/__tests__/socialAuth.route.test.js` — **11 pass / 0
  fail**. `POST /auth/social/link`·`/auth/social/link/state`(F-05가 의도적으로 제거한 옛 패턴)
  라우트 부재 회귀가 이번 회차의 `linkExternalIdentityForValidatedSession` 추가로도 깨지지
  않음을 확인.
- `node impl-check.js node-test backend/__tests__/socialAuth.service.test.js` — **4 pass / 0
  fail**. `linkExternalIdentity`(F-05 기존 계약)가 `linkExternalIdentityForValidatedSession` 위에
  재구성된 뒤에도 실제 DB(EMAIL_CONFLICT/기존 identity 재사용) 동작이 그대로인지 확인.
- `node impl-check.js node-test frontend/src/domains/user/hooks/__tests__/useDiscordAccountLink.test.js` —
  **6 pass / 0 fail**(신규). socialLinkSuccess/socialLinkError → 화면 메시지 매핑, 프로토타입
  오염 방지(React #31류) 검증.
- `node impl-check.js node-test frontend/src/shared/__tests__/discordSupport.test.js` — **7 pass
  / 0 fail**(신규). `VITE_DISCORD_SUPPORT_URL` 미설정=사용 불가, 안전하지 않은 스킴/도메인 거부
  검증.
- `node impl-check.js test`(cwd=backend) — 백엔드 전체 테스트 **1,148 pass / 0 fail / 43
  skipped**(1,191 total). skip은 `F01_TEST_DATABASE_URL` 미설정으로 인한 기존 DB 통합 테스트
  skip(이번 회차의 f07 DB 통합 테스트 8개 포함)이며, skip을 실패로 위장하지 않았다.
- `node impl-check.js test`(cwd=frontend) — 프론트 전체 테스트 **1,241 pass / 0 fail / 0
  skipped**. 이번 회차 신규 13개(useDiscordAccountLink 6개 + discordSupport 7개)를 포함해 전체
  통과, 기존 케이스 회귀 없음.
- `node impl-check.js build`(cwd=frontend) — production build **exit 0**(경고: 메인 청크가
  500KB를 넘음 — 이 슬라이스가 새로 만든 원인이 아니라 기존 번들 구성이며, 이번 변경 범위
  밖이라 손대지 않았다).
- 격리 DB 배경 전체 회귀(`run-backend-tests.cjs`)는 이번 회차에서도 세션 명령 승인 절차에서
  거부되어 실행하지 못했다 — 위 "AC-06" 절 참고. 정규 VERIFY 단계의 재실행이 필요하다.
- 수동 AC-05는 OAuth 설정과 고객센터 초대 URL이 분리된 독립 설정 값으로 실제 존재하는지
  확인한 것이다(위 "AC-05" 절 — 이번 회차는 값 자체를 새로 도입했다). 실제 Discord 인증 성공을
  수동 PASS로 대체한 것이 아니다.

로그 경로는 이번 회차의 `.pluto/progress.md` 기록에 남긴다.

## 복구 절차

아래 파일만 고쳤다(처음 구현 회차 + CODEX-1 재검토 대응 회차 누계) — 롤백이 필요하면 이
목록을 이전 커밋 상태로 되돌리면 된다. 스키마 변경은 없다(`oauth_states`/
`social_signup_intents`/`external_identities` 테이블 구조 변경 없음 — provider 바인딩은 DB가
아니라 서버 서명 쿠키(JWT) payload에만 추가되었고, 명시적 연결(link)도 F-05가 이미 만들어 둔
`external_identities`/`oauth_states` 스키마와 `linkExternalIdentity`/
`issueOAuthState(purpose:"link")` 함수를 그대로 재사용한다 — 새 라우트만 추가되었다).

- `backend/service/discordOAuth.service.js` (처음 구현 회차 신규 + R-IMPL 복구 회차:
  `resolveRedirectUri(purpose)` 도입, `buildAuthorizationUrl`/`exchangeCodeForProfile`가
  `DISCORD_LINK_REDIRECT_URI`를 별도로 읽음)
- `backend/service/socialAuth.service.js` (R-IMPL 복구 회차 최초 수정: `linkExternalIdentity`를
  상태 소비 이후 절차만 하는 `linkExternalIdentityForValidatedSession`과 그 위에 상태 소비를
  더한 기존 계약으로 재구성 — F-05 동작·테스트는 그대로 보존)
- `backend/controller/user.controller.js` (처음 구현 회차 + CODEX-1 대응: `discordLinkStart`/
  `discordLinkCallback` 추가 + R-IMPL 복구 회차: link는 purpose:link로 redirect_uri를 고르고,
  콜백은 state를 코드 교환 전에 먼저 소비·바인딩 확인하며, 성공/실패 리다이렉트 목적지를
  `/lobby`에서 `/account`로 변경)
- `backend/routes/auth.routes.js` (처음 구현 회차 + CODEX-1 대응: `GET /auth/discord/link`·
  `GET /auth/discord/link/callback` 등록, 이번 회차는 라우트 자체는 수정하지 않음)
- `backend/__tests__/discordAuth.route.test.js` (처음 구현 회차 신규 + CODEX-1 대응: AC-03
  EMAIL_MISSING·AC-04 링크 라우트 테스트 추가 + R-IMPL 복구 회차: link 콜백 state-소비-우선
  순서·STATE_USER_MISMATCH·redirect_uri purpose 케이스로 갱신)
- `backend/__tests__/discordOAuth.service.test.js` (처음 구현 회차 신규 + R-IMPL 복구 회차:
  purpose:link redirect_uri 분리 테스트 3개 추가)
- `backend/__tests__/googleAuth.route.test.js` (처음 구현 회차, 이번 회차는 수정하지 않음 —
  전체 회귀로 회귀 없음 재확인)
- `backend/tests/db/f07-discord-oauth.integration.test.js` (CODEX-1 대응 회차 신규 — AC-02/
  AC-03/AC-04 실제 DB 증거 + R-IMPL 복구 회차: 닉네임 fixture 수정, rememberMe true/false 분리,
  link redirect_uri 추적 assertion 추가)
- `frontend/src/domains/auth/components/LoginForm/SocialLoginButtons.jsx` (처음 구현 회차)
- `frontend/src/domains/auth/components/SocialSignupForm.jsx` (처음 구현 회차)
- `frontend/src/domains/auth/hooks/useLoginPage.js` (처음 구현 회차)
- `frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js` (처음 구현 회차)
- `frontend/src/domains/user/components/DiscordAccountLink.jsx` (R-IMPL 복구 회차 신규)
- `frontend/src/domains/user/components/AccountPanel.jsx` (R-IMPL 복구 회차: `DiscordAccountLink`
  배치)
- `frontend/src/domains/user/components/AccountPanel/PasswordSection.jsx` (R-IMPL 복구 회차:
  더 이상 마지막 섹션이 아니라 구분선 스타일로 변경)
- `frontend/src/domains/user/hooks/useDiscordAccountLink.js` (R-IMPL 복구 회차 신규 — 순수 메시지
  판정 로직)
- `frontend/src/domains/user/hooks/__tests__/useDiscordAccountLink.test.js` (R-IMPL 복구 회차
  신규)
- `frontend/src/shared/env.js` (R-IMPL 복구 회차: `VITE_DISCORD_SUPPORT_URL` 추가)
- `frontend/src/shared/discordSupport.js` (R-IMPL 복구 회차 신규 — 초대 URL 검증 순수 함수)
- `frontend/src/shared/__tests__/discordSupport.test.js` (R-IMPL 복구 회차 신규)
- `docs/requirements/2026-09-10-f07-verification.md` (본 문서, 처음 구현 회차 신규 + CODEX-1
  대응 회차 갱신 + R-IMPL 복구 회차 갱신)
