# F-06 Google 로그인 — 검증 근거 및 외부 연동 미검증 기록

날짜: 2026-09-10
슬라이스: Pluto AQ (F-06)

이 문서는 CODEX-2.json이 655307a9 회차를 재반려한 두 지적(AC-05 외부 연동 미검증 기록
부재, AC-06 npm ci 실패로 인한 build/backend wrapper 미실행)에 대한 대응 기록이다.
`.pluto/done.json`/`.pluto/progress.md`만 갱신하고 patch에는 반영되지 않은 채 no-change로
반송된 이전 회차의 실패를 반복하지 않기 위해, 이 문서 자체를 patch에 포함되는 추적 대상
산출물로 커밋한다.

## AC-05 — 실제 Google 외부 연동은 readiness_unverified

이 슬라이스는 실제 Google 클라이언트 ID·비밀키·등록된 redirect_uri를 받은 적이 없다.
그 결과 아래 세 시나리오는 실제 Google 계정으로 실행한 근거가 없고, `readiness_unverified`로
남긴다.

- **최초 로그인(신규 Google 계정)** — readiness_unverified.
- **재로그인(이미 연결된 Google 계정)** — readiness_unverified.
- **취소(Google 동의 화면에서 사용자가 취소)** — readiness_unverified.

### 실제 연동에 필요한 것 (서버 환경변수 이름만, 값은 기록하지 않음)

`backend/service/googleOAuth.service.js`의 `readRequiredEnv`가 호출 시점에 아래 이름을
읽는다 — 이름만 여기 남기고 실제 값(비밀키 등)은 어디에도 기록하지 않는다.

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (Google Cloud Console에 등록된 콜백 URL과 정확히 일치해야 함)
- `GOOGLE_OAUTH_TIMEOUT_MS` (선택, 기본 8000ms — 제공자 응답 타임아웃)

이 네 값이 실제로 채워지고, `GOOGLE_REDIRECT_URI`가 Google 콘솔에 등록된 콜백과 일치하는
배포 환경에서 사람이 브라우저로 최초/재로그인/취소 세 시나리오를 직접 눌러 확인해야 위
readiness_unverified 상태가 검증됨으로 바뀐다. 이 저장소의 어떤 자동 테스트도 이 조건을
대신 만족시키지 않는다.

### 로컬 fixture·UI 검증과의 구분

아래는 실제 Google 외부 인증이 **아니며**, 그렇게 주장하지 않는다.

- `backend/__tests__/googleAuth.route.test.js`(17개)·`backend/__tests__/socialAuth.route.test.js`는
  `socialAuthService`/`googleOAuthService`를 스텁으로 대체한 서버 라우트 계약 테스트다 —
  실제 Google 서버와 통신하지 않는다.
- `backend/__tests__/googleOAuth.service.test.js`(8개)는 `exchangeCodeForProfile`이 실제
  Google 엔드포인트가 아니라 로컬 `http.createServer` fixture로 왕복하도록 `fetch` 목적지만
  바꾼 것이다 — 요청 형태(본문·헤더)와 실패·타임아웃 처리를 검증할 뿐, 실제 Google 계정
  인증을 증명하지 않는다.
- 아래 "UI 직접 확인" 절의 화면 동작은 실제 Google 리다이렉트 없이 URL 쿼리를 직접 조작해
  확인한 것이다.

### 운영자가 직접 확인한 UI 동작 (실제 Google 인증은 아님)

운영자가 이번 회차 이전에 브라우저에서 직접 확인한 항목들이다 — 실제 Google 계정으로 왕복한
것이 아니라 로컬 서버에서 화면 렌더링과 클라이언트 검증만 확인한 것이며, 위 readiness_unverified
판정을 바꾸지 않는다.

- `/login?socialIntent=...`에서 소셜 가입 보완 폼(닉네임·생년월일)만 UI로 렌더링됨.
- 생년월일 미입력 시 제출이 거부됨(필수 항목).
- 9자 닉네임 입력 시 거부됨(닉네임 길이 상한 초과).
- 소셜 오류 취소 후 쿼리 정리(재시도 시 이전 `socialError` 쿼리가 남지 않음).
- `EMAIL_CONFLICT` 오류 문구가 화면에 표시됨.

### 이번 회차의 새 크래시 수정과 회귀 확인

2026-09-10 09:56:37Z 실제 Chrome에서 `/login?socialError=__proto__`로 접속하면
"Unexpected Application Error / React #31"로 애플리케이션이 죽는 것이 재현되었다
(증거: `.pluto/monitor/AQ-browser-655307a9.json`). 원인은
`frontend/src/domains/auth/hooks/useLoginPage.js`의 `mapSocialErrorCode`가 일반 객체
`SOCIAL_ERROR_MESSAGES`를 대괄호 표기법으로 색인해, own property가 아닌 상속 키
(`__proto__`·`constructor`·`toString`·`hasOwnProperty`)까지 값으로 반환했고 그 값이 문자열이
아닌 객체/함수라 그대로 렌더링에 쓰이면 React가 크래시하는 것이었다.

`mapSocialErrorCode`를 `Object.prototype.hasOwnProperty.call` 가드로 고쳐, 이 목록에 실제로
정의한 own key만 신뢰하고 그 외에는(위 네 가지 포함) `DEFAULT_SOCIAL_ERROR_MESSAGE`로
대체하도록 했다. `frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js`에
`__proto__`/`constructor`/`toString`/`hasOwnProperty`/알 수 없는 코드 각각의 회귀를
추가했고, 기존 `EMAIL_CONFLICT`/`OAUTH_CANCELLED` 정상 문구가 그대로 보존됨도 같은 테스트로
재확인했다. 이 수정 이후의 실제 브라우저 재확인은 운영자가 다음 빌드에서 직접 수행한다
(이 문서 작성 시점에는 아직 수행되지 않았다 — readiness_unverified와 별개로, 이 크래시
자체의 브라우저 재확인도 미완료 항목으로 남긴다).

## AC-06 — 실제 격리 DB 회귀 증거

이전 회차는 `npm ci --prefix frontend`가 운영체제 권한 거부(EPERM)로 실패해 production
build와 backend wrapper 실행이 건너뛰어졌다. 원인은 운영자가 띄워둔 Vite preview(PID 31288)가
`lightningcss` 네이티브 바이너리를 점유하고 있었던 것으로 확인되었고, 그 프로세스를 중지한
뒤 `npm ci --prefix frontend`가 정상 완료됨을 이번 회차에서 재확인했다. 다른 프로세스 종료,
Docker 변경, 툴체인 재설치는 하지 않았다.

`.pluto/operator-validation.json`(이 워크트리, 커밋 `655307a9` 시점)에 운영자가 승인된 전체
wrapper로 실행한 실제 backend 회귀 결과가 기록되어 있다.

- 실행 스크립트: `node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test`
- 로그: `C:/Users/minsa/jokertest/.pluto/monitor/AQ-backend-655307a9.log`
- 결과: **1145 pass / 0 fail / 0 skipped** (`ℹ tests 1145`, `ℹ pass 1145`, `ℹ fail 0`,
  `ℹ skipped 0`)
- 격리: wrapper가 `backend/package.json`의 test 스크립트를 그대로 검증한 뒤
  `--env-file=.env.test --test --test-concurrency=1`으로 실행하고,
  `F01_TEST_DATABASE_URL`을 비공개 설정에서 주입한다.
- DB 허용 목록: `pluto_f01_20260909_al`, `pluto_f01_20260909_al_restore_check` — 이 두 이름만
  허용한다(`backend/tests/db/isolatedTestDb.js`가 재설정 직전 실제 `SELECT DATABASE()`로
  현재 연결 대상을 확인하고 목록에 없으면 거부한다).
- 실행 계정 DB나 Docker 볼륨을 삭제·초기화한 적이 없다.
- 비공개 접속 정보(비밀번호 등)는 이 문서를 포함해 어디에도 출력·기록하지 않는다.

0 skipped는 이전 회차들이 반복해 기록했던 "DB 없음으로 전부 skip" 상태(예:
`backend/tests/db/f05-social-auth.integration.test.js` 단독 실행 시의 14 skip)와는 다른,
전용 격리 DB가 실제로 연결된 상태의 결과다 — 이 문서는 "MySQL이 없다"거나 "모든 DB 테스트가
skip된다"는 이전 주장을 반복하지 않는다.

이 문서 작성만으로 AC-06을 완료 처리하지 않는다 — 최종 정규 Pluto VERIFY 단계가 이번
회차에서 변경된 코드를 대상으로 설정된 build/test 명령을 다시 그대로 실행해 통과를 확인해야
한다(아래 "실행한 검증" 참고).

## 실행한 검증 (이번 회차)

- `node impl-check.js node-test frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js`
  — `mapSocialErrorCode`/`resolveSocialLoginView` own-property 가드와 기존 회귀 전체.
- `node impl-check.js test`(cwd=frontend) — frontend 전체 테스트.
- `node impl-check.js build`(cwd=frontend) — production build.
- 로그 경로는 `.pluto/progress.md`의 이번 회차 기록에 남긴다.

## 복구 절차

이번 회차는 `frontend/src/domains/auth/hooks/useLoginPage.js`의 `mapSocialErrorCode`와
`frontend/src/domains/auth/pages/__tests__/LoginPage.social.test.js`만 고쳤다. 롤백이
필요하면 두 파일을 이전 커밋(`655307a9`) 상태로 되돌리면 된다 — 스키마·API 계약 변경은
없다.
