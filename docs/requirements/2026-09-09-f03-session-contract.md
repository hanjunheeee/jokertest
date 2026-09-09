# F-03 세션 정책 및 검증 기록 — 로그인 유지·세션 만료

> 이 문서의 이전 판(2026-09-09 최초 작성)은 "액세스 토큰(JWT) 자체를 30일로 늘리는 것으로
> AC-01을 만족시켰다"고 기록했다. 그 설계는 운영자 검토(R-IMPL, 2026-09-10)에서 반려됐다 —
> 쿠키만 30일 남아 있을 뿐 실제 회전형 갱신·서버 측 해시 저장·재사용 감지·폐기 연동이 전혀
> 없어 "로그인 유지"가 이름만 있고 실질적으로 시험되지 않았다는 지적이다. 아래는 그 지적을
> 반영해 실제로 구현한 회전형 갱신 자격(refresh token rotation) 설계다.

## 정책 요약

- **로그인 유지(rememberMe === true)**: 로그인 시 두 가지 자격을 함께 발급한다.
  - **액세스 토큰**(`accessToken` 쿠키, JWT): 로그인 유지 여부와 무관하게 **짧게**
    만료된다(`ACCESS_TOKEN_SHORT_TTL_SECONDS` = 15분, `backend/auth/cookieOptions.js`).
    쿠키의 Max-Age는 여전히 30일이지만(브라우저 재시작 후에도 쿠키 자체는 남아 있어야
    하므로), JWT 내부의 `exp`는 짧다 — 그래야 만료 후 실제로 갱신 경로가 실행된다.
  - **갱신 자격**(`refreshToken` 쿠키, 무작위 256비트 값): 로그인 시점 기준 **절대
    30일**(`PERSISTENT_SESSION_MAX_AGE_MS`) 만료다. 서버는 이 값의 sha256 해시만
    `user_sessions.refresh_token_hash`에 저장하고(`backend/service/auth.service.js`의
    `hashRefreshToken`), 원문은 응답 쿠키로만 나가고 어디에도 저장되지 않는다(A-03).
- **로그인 유지 미선택**: `refreshToken` 쿠키 자체가 발급되지 않는다. `accessToken`은
  Max-Age/Expires가 없는 세션 쿠키로 발급되고, JWT `exp`도 기존과 동일하게 1일이다 —
  갱신 수단이 없으므로 액세스 토큰이 만료되면 재로그인이 필요하다(AC-02).
- **회전(rotation)**: `POST /auth/refresh`(`backend/routes/auth.routes.js`,
  `backend/controller/user.controller.js`의 `refresh`, `authService.refresh`)가 매 호출마다
  현재 갱신 자격을 새 자격으로 교체한다. 절대 만료(`refresh_token_expires_at`)는 회전으로
  **연장되지 않는다**.
- **응답 유실·동시 요청 유예**: 회전 직전의 해시는 `refresh_previous_hash` +
  `refresh_previous_expires_at`(30초)에 짧게 보관된다. 같은 자격으로 거의 동시에 두 요청이
  들어오거나(A-08), 네트워크 문제로 회전 응답이 유실돼 클라이언트가 여전히 옛 자격을 들고
  있는 경우, 이 유예 창 안에서는 재사용으로 오판하지 않고 다시 회전시켜 준다.
- **재사용 감지**: 유예 창을 벗어났거나 현재/직전 어느 해시와도 맞지 않는 자격이 제시되면
  탈취로 간주해 그 사용자의 **모든** 세션(모든 갱신 자격 포함)을 폐기한다
  (`userRepository.markOnlineSessionsOffline`, `revoked_at` 기록).
- **세션 유효성 재검사**: `user_sessions.is_online`·`revoked_at`·활성 밴 여부는 매 보호
  요청마다 캐시 없이 다시 조회한다(`backend/auth/sessionLifecycle.js`의 `resolveSession`).
  HTTP(`auth.middleware.js`의 `verifyToken`), Socket.IO 연결(`socket.js`의
  `authenticateSocket`), 그리고 **이미 연결된 소켓의 후속 이벤트**(`socket.js`의
  `wrapSocketWithSessionGuard`, disconnect 제외 전 이벤트에 적용)가 모두 이 함수를 그대로
  공유한다 — 로그아웃·타 기기 재로그인·운영 밴·비밀번호 변경이 다음 요청/이벤트부터 세
  경로 전부에 즉시 반영된다(AC-05/AC-09).

## 스키마 — `backend/db/migrations/0003-add-refresh-token-rotation.js`

`user_sessions`에 5개 컬럼을 추가한다(모두 nullable, 기존 행에 영향 없음, A-06):

| 컬럼 | 용도 |
| --- | --- |
| `refresh_token_hash` | 현재 유효한 갱신 자격의 sha256 해시 |
| `refresh_previous_hash` | 방금 대체된 이전 해시(응답유실 유예용) |
| `refresh_previous_expires_at` | 위 유예의 만료 시각(회전 후 +30초) |
| `refresh_token_expires_at` | 로그인 시점 기준 절대 만료(+30일), 회전으로 연장되지 않음 |
| `revoked_at` | 로그아웃·비밀번호 변경·재사용 감지로 이 세션이 폐기된 시각 |

0001/0002와 같은 멱등 패턴(`describeTable` 확인 후 없는 컬럼만 추가)이며,
`backend/tests/db/f01-migrations.integration.test.js`의 `MIGRATIONS` 목록과
`backend/scripts/migrate-db.js`에 함께 등록했다.

## 회전 알고리즘 (`authService.refresh`, 트랜잭션 + 행 잠금)

1. 제시된 원문을 해시해 `refresh_token_hash` 또는 `refresh_previous_hash`가 일치하는
   세션을 `FOR UPDATE`로 잠그고 조회한다(`userRepository.findSessionForRefresh`).
2. 세션이 없거나 `revoked_at`이 있으면 401. 절대 만료(`refresh_token_expires_at`)를
   넘겼으면 401(재로그인 요구). 활성 밴이면 403.
3. 제시된 해시가 `refresh_token_hash`(정상 회전)이거나, `refresh_previous_hash`이면서
   유예 시간 안(응답유실/동시요청 재시도)이면: 새 무작위 자격을 생성하고, 기존
   `refresh_token_hash`를 `refresh_previous_hash`로 내리며 새 유예 창을 연다
   (`userRepository.applyRefreshRotation`). 절대 만료는 건드리지 않는다.
4. 어느 쪽과도 맞지 않으면 재사용 감지 — 이 사용자의 모든 세션을 폐기하고 401.

## AC-06 — 세션 쿠키 방식과 "브라우저 종료 즉시 서버 세션 폐기" 방식의 차이

이번 구현은 **세션 쿠키(로그인 유지 미선택 시 Max-Age 없음) 방식**을 쓴다. 이 절의 결론은
회전형 갱신 자격 도입 이후에도 바뀌지 않는다 — 갱신 자격은 로그인 유지를 선택했을 때만
발급되므로, 이 절은 "로그인 유지 미선택" 경로에 대한 것이다.

- 브라우저가 완전히 종료되면 브라우저가 쿠키 저장소에서 세션 쿠키(`accessToken`)를
  지운다. 그 클라이언트는 이후 인증 쿠키를 다시 보낼 수 없으므로, 결과적으로 로그인이
  풀린 것과 같은 효과를 낸다.
- 그러나 이것은 **"브라우저 종료를 서버가 감지해 그 순간 `user_sessions`를 폐기하는
  것"과 다르다.** 서버는 브라우저가 실제로 닫혔는지 알 방법이 없다 — HTTP는 상태가 없고,
  Socket.IO의 `disconnect` 이벤트는 새로고침·일시적 네트워크 단절과 구분되지 않는다
  (`backend/socket/socket.js`의 `handleDisconnect` 주석 참고: 과거에 disconnect가 인증
  세션까지 내렸다가 새로고침만으로 로그아웃되는 회귀가 있었고, 그 이후 disconnect는
  presence만 내리고 인증 세션(`is_online`/`revoked_at`)은 건드리지 않도록 고정했다).
- 따라서 이 구현에서 `user_sessions` 행은 브라우저 종료만으로 즉시 폐기되지 않는다. 명시적
  로그아웃, 같은 계정의 타 기기 재로그인, 비밀번호 변경, 운영 밴, 갱신 자격 재사용
  감지에 의해서만 폐기된다.
- 결과적으로 **"세션 쿠키가 사라져 클라이언트가 더 이상 인증할 수 없게 되는 것"이 로그인
  유지 미선택 시의 실질적 만료 수단**이고, 서버 측 `user_sessions` 행 자체는 그보다 늦게
  (또는 다른 계정 활동 시점에) 정리될 수 있다. 이는 의도된 트레이드오프이며, 원 요구사항의
  "세션 쿠키 방식"과 "서버가 브라우저 종료를 능동적으로 감지해 즉시 세션 행을 폐기하는
  방식" 사이의 실제 차이를 그대로 인정한다. 후자를 원한다면 별도의 하트비트/TTL 스키마
  설계가 필요하며, 그 설계는 이번 슬라이스의 범위 밖이다.

## AC-03/AC-04 — 로그아웃·정지·비밀번호 변경 트리거

- **로그아웃**(`user.controller.js`의 `logout` → `userRepository.recordLogout`): 해당
  세션의 `is_online=false` + `revoked_at`을 기록한다 — 이제 HTTP·Socket뿐 아니라 그
  세션의 갱신 자격(refresh)도 이후 재사용 감지 없이 즉시 거부된다.
- **운영 밴**: `sessionLifecycle.resolveSession`의 `checkActiveBan` 재검사(HTTP·Socket.IO
  연결·소켓 후속 이벤트 공통) + `authService.refresh` 안의 별도 `checkActiveBan` 재검사로,
  밴 이후에는 액세스 요청과 갱신 요청 모두 막힌다.
- **비밀번호 변경**(`backend/controller/profile.controller.js`의 `updatePassword`):
  `password_hash` 갱신과 `userRepository.markOnlineSessionsOffline(uuid, {transaction})`
  (전체 세션 `is_online=false` + `revoked_at` 기록)를 하나의 트랜잭션으로 묶는다. 폐기가
  실패하면 비밀번호 변경도 커밋되지 않는다 — 그렇지 않으면 변경 이전에 탈취된 세션(및 그
  갱신 자격)이 새 비밀번호 발급 이후에도 유효하게 남는다. 이 호출은 요청 자신이 사용 중인
  세션도 함께 폐기하므로, 비밀번호 변경 응답 이후 같은 브라우저에서도 재로그인이 필요하다.

## `markOnlineSessionsOffline`은 이제 "폐기"다

`backend/repositories/user.repositories.js`의 `markOnlineSessionsOffline(user_id, options)`는
`is_online=false`뿐 아니라 `revoked_at`도 함께 기록하고, 대상 조건도 `is_online:true`가
아니라 `revoked_at:null`(아직 폐기되지 않은 모든 세션)로 넓혔다 — `is_online`이 이미
false여도 갱신 자격(refresh)은 유효할 수 있어, 그 경로까지 함께 막아야 하기 때문이다. 로그인
시 중복 세션 정리, 비밀번호 변경, 갱신 자격 재사용 감지 세 곳 모두 이 함수를 쓴다. 두 번째
인자로 `{ transaction }`을 받아 원자성이 필요한 호출(비밀번호 변경)에서 쓸 수 있다.

## HTTP/프론트 갱신 재시도, Socket 재인증 배선

- **`GET /auth/me` 등 보호 라우트**: 액세스 토큰이 `jsonwebtoken`의 `TokenExpiredError`로
  실패하면 `auth.middleware.js`가 401 응답에 `code: "ACCESS_TOKEN_EXPIRED"`를 싣는다(그 외
  실패는 code 없이 기존과 동일). 서명 위조·세션 폐기·정지 같은, 갱신해도 성공할 수 없는
  401과 구분하기 위함이다.
- **`frontend/src/shared/api/client.js`**: `apiClient`가 401 + `code ===
  "ACCESS_TOKEN_EXPIRED"`를 받으면 `refreshAccessToken()`(진행 중인 갱신 요청을 공유하는
  단일 in-flight 프라미스)을 호출해 갱신을 기다린 뒤, 성공하면 원 요청을 **정확히 한 번만**
  재시도한다. 갱신이 실패하면 재시도 없이 그대로 401 처리(로그아웃)로 흘려보낸다. 액세스
  만료는 인증 미들웨어 단계에서 걸리므로 컨트롤러 로직은 아직 실행되지 않은 상태다 — 재시도가
  변경 요청을 중복 실행시키지 않는다(A-07).
- **`frontend/src/shared/hooks/useSocket.js`**: 소켓 연결·재연결이 `connect_error`로
  "UNAUTHORIZED"를 받으면(액세스 토큰 만료 상태로 handshake를 시도한 경우)
  `refreshAccessToken()`(apiClient와 같은 함수, 같은 in-flight 프라미스를 공유)을 호출한
  뒤 성공 시에만 `socket.connect()`로 재연결한다. 갱신이 실패하면 더 이상 재시도하지
  않아(`reauthExhausted`) 무한 루프를 만들지 않는다.
- **`backend/socket/socket.js`의 `wrapSocketWithSessionGuard`**: 이미 연결된 소켓에서도
  `disconnect`를 제외한 모든 이벤트 앞에 `sessionLifecycle.resolveSession`을 다시 통과시켜,
  handshake 이후에 일어난 로그아웃·정지·비밀번호 변경을 그 소켓의 다음 동작부터 즉시
  반영한다(AC-09). matchmaking.js·gameSession.js는 건드리지 않았다 — `socket.on`을 감싸는
  방식이라 두 모듈이 등록하는 핸들러에도 자동으로 적용된다.

## 실제 검증 상태

아래는 이번 작업 트리에서 격리 없이 실행 가능한 단위/통합 테스트로 검증한 것이다. 실제
브라우저 재시작·프로덕션 빌드·격리 MySQL을 통한 마이그레이션 재실행/복구는 이 실행 환경에서
격리 MySQL 자격 증명을 구할 수 없어 수행하지 못했다(F01 격리 DB 테스트와 동일 사유, skip으로
표시됨 — "미검증"임을 숨기지 않는다).

- AC-01/AC-02: `backend/__tests__/auth.login.regression.test.js` — 로그인 유지 여부에 따라
  액세스 토큰 TTL(15분/1일)과 갱신 자격 발급 여부·절대 만료(30일)가 갈리는지 확인.
- AC-01/A-03/A-08: `backend/service/auth.service.refresh.test.js` — 정상 회전, 절대 만료
  초과 거부, 폐기된 세션 거부, 정지 계정 거부, 절대 만료가 회전으로 연장되지 않음, 응답유실
  유예 안에서의 재시도 허용(세션 유지), 유예 밖·미지 자격 재사용 감지 시 전체 세션 폐기.
- AC-02: `backend/auth/cookieOptions.test.js` — `rememberMe=false`일 때 쿠키에
  `maxAge`/`expires`가 없는지, 갱신 쿠키 옵션이 절대 30일인지, 로그아웃 시 두 쿠키(access +
  refresh) 모두 제거되는지 확인.
- AC-03/AC-05: `backend/__tests__/auth.sessionGuard.test.js`(HTTP, `revoked_at` 반영 포함) +
  `backend/socket/socket.authSession.test.js`(Socket.IO 연결 시점 + 이미 연결된 소켓의 후속
  이벤트 재검증) — 폐기된 세션·정지된 계정이 HTTP·Socket.IO 연결·소켓 후속 동작 모두에서
  같은 `sessionLifecycle.resolveSession` 기준으로 거부되는지 확인.
- AC-05: `backend/auth/sessionLifecycle.test.js` — 공유 검증 함수 자체의 단위 테스트.
- AC-03/AC-04: `backend/__tests__/profile.updatePassword.sessionRevocation.test.js` —
  비밀번호 변경 성공 시 새 비밀번호와 세션 전체 폐기가 같은 트랜잭션으로 커밋되는지, 폐기
  실패 시 비밀번호 변경도 함께 롤백되는지(원자성), 현재 비밀번호가 틀리면 트랜잭션 자체를
  열지 않는지, 비밀번호 변경 이후 같은 세션의 토큰으로 보낸 후속 보호 요청이 거부되는지
  (재로그인 요구)를 확인한다.
- A-06: `backend/tests/db/f01-migrations.integration.test.js`의 0003 전용 테스트 —
  격리 MySQL이 있을 때 컬럼 추가·재실행 멱등성·기존 세션 데이터 보존을 확인(이 실행
  환경에서는 `F01_TEST_DATABASE_URL` 부재로 skip).
- 프론트 `apiClient`/`useSocket`의 갱신 재시도·소켓 재인증 로직은 `import.meta.env`를
  Vite 빌드 타임에 치환하는 구조라 이 저장소의 `node --test` 러너로는 직접 단위 테스트할
  수 없다(기존에도 `frontend/src/shared/api/client.js`를 직접 import하는 테스트가 없다).
  `npm run build --prefix frontend`(프로덕션 빌드 성공 여부)로 문법·타입 오류만 확인했고,
  실제 브라우저에서의 갱신 재시도·소켓 재연결 동작은 이 실행 환경 밖에서 확인이 필요하다.
