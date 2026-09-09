# F-03 세션 정책 및 검증 기록 — 로그인 유지·세션 만료

> 이 문서의 최초 판(2026-09-09)은 "액세스 토큰(JWT) 자체를 30일로 늘리는 것으로 AC-01을
> 만족시켰다"고 기록했다. 그 설계는 운영자 검토(R-IMPL #1, 2026-09-10 새벽)에서 반려됐다 —
> 쿠키만 30일 남아 있을 뿐 실제 회전형 갱신·서버 측 해시 저장·재사용 감지·폐기 연동이 전혀
> 없어 "로그인 유지"가 이름만 있고 실질적으로 시험되지 않았다는 지적이다.
>
> 그 지적을 반영해 회전형 갱신 자격(refresh token rotation)을 구현한 판(커밋 bd30e791)도
> 실제 격리 MySQL 전체 회귀(1038개 중 6개 실패)와 독립 검토(CODEX-1)에서 다시 반송됐다
> (R-IMPL #2, 2026-09-10 03:02). 지적 요지: (1) 재사용 감지의 세션 폐기가 managed
> transaction 안에서 `throw`한 뒤라 rollback으로 취소됐다, (2) 새 JWT exp·쿠키 수명이
> 로그인 시점의 절대 30일 기한을 넘을 수 있었다(회전마다 Max-Age를 다시 꽉 채웠다), (3)
> grace(응답유실 유예) 재시도마다 다시 회전해 3개 이상 동시 요청에서 정상 세션을 재사용으로
> 오판했다, (4) 프론트 `useSocket`이 HTTP 갱신 성공 뒤에도 소켓이 계속 UNAUTHORIZED면
> 무한 재시도했다, (5) 정지 감지가 단순 거부일 뿐 세션을 영구 폐기하지 않아 밴 해제 후
> 옛 세션이 되살아났다, (6) `import.meta.env`를 이유로 프론트 로직이 실제로는 테스트되지
> 않았다. 이 문서는 그 두 번째 반송(R-IMPL #2)의 수정 결과를 반영한다 — 아래 "R-IMPL #2
> 수정 내역" 절 참고.

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
   넘겼으면 401(재로그인 요구). 활성 밴이면 이 사용자의 모든 세션을 영구 폐기하고 403
   (R-IMPL #2 #5 — 아래 "정지 감지 시 영구 폐기" 절 참고).
3. 새 액세스 토큰의 TTL을 `capAccessTokenTtlSeconds(15분, refresh_token_expires_at)`로
   계산한다 — 절대 30일 기한까지 15분보다 적게 남았으면 그 남은 초(내림)만큼만 발급한다
   (R-IMPL #2 #4). 0 이하로 계산되면(경계 통과) 401.
4. 제시된 해시가 `refresh_token_hash`(정상 회전, "fresh match")면: 새 무작위 자격을
   생성하고 기존 `refresh_token_hash`를 `refresh_previous_hash`로 내리며 새 유예 창(30초)을
   연다(`userRepository.applyRefreshRotation`). 절대 만료는 건드리지 않는다. 새 액세스
   토큰 + 새 갱신 자격을 함께 응답한다.
5. 제시된 해시가 `refresh_previous_hash`이면서 유예 시간 안(응답유실/동시요청 재시도,
   "grace match")이면: **회전은 다시 실행하지 않는다** — 새 액세스 토큰만 응답하고
   `refreshToken`은 `null`이다(R-IMPL #2 #3 참고 — 아래 절에서 이유를 설명한다). 컨트롤러는
   `refreshToken`이 `null`이면 갱신 쿠키를 건드리지 않는다.
6. 어느 쪽과도 맞지 않으면 재사용 감지 — 이 사용자의 모든 세션을 폐기하고 401.

트랜잭션 콜백 자체는 어떤 경우에도 `throw`하지 않는다 — 위 2/6의 폐기(UPDATE)를 포함해
항상 `{ type, ... }` 형태의 결과 객체를 `return`하고, 트랜잭션이 커밋된 **뒤에** 그 타입에
맞는 오류를 던진다(아래 "재사용 감지 폐기가 rollback으로 취소되던 문제" 절 참고).

## R-IMPL #2 수정 내역

운영자 반송(2026-09-10 03:02, corrections 1~10)에서 지적된 6개 결함과 수정 내용이다.

### 재사용 감지 폐기가 rollback으로 취소되던 문제 (지적 #3)

이전 코드는 재사용 감지 분기에서 `markOnlineSessionsOffline`(UPDATE)을 실행한 뒤 같은
managed transaction 콜백 안에서 바로 `throw`했다. Sequelize의 managed transaction은 콜백이
throw하면 그 트랜잭션 전체를 rollback한다 — 즉 "폐기했다"고 믿었던 UPDATE 자체가
취소되고, DB에는 아무 흔적도 남지 않았다. mock으로 `markOnlineSessionsOffline` 호출
여부만 확인하던 기존 테스트는 이 rollback을 잡아내지 못했다.

수정: `refresh()`의 트랜잭션 콜백은 이제 `{ type: "reuse" | "banned" | ... }`처럼 결과를
**반환**만 하고 절대 throw하지 않는다. 폐기(UPDATE)를 포함한 모든 쓰기는 콜백이 정상
반환되며 트랜잭션이 커밋될 때 함께 확정된다. 콜백이 반환한 `outcome.type`을 트랜잭션이
끝난 **뒤에** 검사해, 그때 가서 적절한 상태 코드로 던진다 — 이러면 "폐기는 성공했지만
그 사실을 알리는 응답은 실패"인 정상적인 흐름이 된다. 실제 DB 검증은
`backend/tests/db/f03-session.integration.test.js`("R-IMPL #3" 테스트)가 담당한다 —
재사용 감지 이후 `revoked_at`을 실제로 다시 조회해 커밋됐는지 확인하고, HTTP·refresh·
`sessionLifecycle.resolveSession` 세 경로 모두가 그 폐기를 일관되게 반영하는지도 함께 본다.

### 절대 30일 기한을 넘는 JWT/쿠키가 발급될 수 있던 문제 (지적 #4)

이전 코드는 회전마다 액세스 토큰을 고정 15분으로, 갱신·액세스 쿠키의 Max-Age를 고정
30일로 다시 계산했다. 로그인 시점 기준 30일에 가까운 시점에 회전이 일어나면, 새로
발급되는 자격들이 "로그인 시점부터 30일"이라는 절대 기한을 실제로 넘어설 수 있었다 —
쿠키 Max-Age는 매번 새로 30일을 꽉 채우므로 사실상 절대 기한이 매 회전마다 연장되는
것과 같은 결과를 낳았다.

수정:
- `cookieOptions.capAccessTokenTtlSeconds(shortTtl, absoluteExpiresAt, now)`가 JWT `exp`를
  `min(shortTtl, floor((absoluteExpiresAt - now) / 1000))`로 자른다. `jsonwebtoken`의
  `iat`도 초 단위로 내림 계산되므로, 두 내림이 겹쳐도 `exp(ms)`는 항상
  `absoluteExpiresAt` 이하로 유지된다(반올림으로 경계를 넘기지 않는다).
- `cookieOptions.buildSessionCookieOptions(rememberMe, absoluteExpiresAt)`와
  `buildRefreshCookieOptions(absoluteExpiresAt)`가 `absoluteExpiresAt`이 주어지면
  Max-Age를 "그 시각까지 남은 시간"으로 계산한다(인자를 생략하면 기존처럼 고정 30일 —
  로그인 시점 자신을 계산할 때는 어차피 남은 시간이 정확히 30일이라 결과는 같다).
  `login()`은 방금 계산한 `refreshTokenExpiresAt`(로그인 시점 + 30일)을 넘기고, `refresh()`
  응답은 세션에 저장된(회전으로 연장되지 않는) `refresh_token_expires_at`을 그대로 넘긴다.
- `sessionLifecycle.resolveSession`이 `session.refresh_token_expires_at`을 직접 검사해,
  절대 기한을 넘긴 세션은 `is_online`/`revoked_at`이 멀쩡해도 거부한다. 이게 필요한
  이유는 Socket.IO 연결이 handshake 이후 JWT를 다시 검증하지 않기 때문이다 — 액세스
  토큰의 `exp` 캡만으로는 "30일 전에 연결된 뒤 한 번도 끊기지 않은 소켓"의 후속 이벤트를
  막을 수 없다(`wrapSocketWithSessionGuard`가 매 이벤트마다 `resolveSession`을 다시
  통과시키므로 이 DB 검사가 그 소켓에도 적용된다). 이 검사를 위해
  `userRepository.findActiveSession`의 `attributes`에 `refresh_token_expires_at`을 추가했다.
- 경계·반올림 검증: `backend/auth/cookieOptions.test.js`(캡 헬퍼 단위 테스트: 여유
  있을 때 그대로/임박 시 내림/경계에서 0/이미 지남)와
  `backend/service/auth.service.refresh.test.js`("절대 기한" 테스트 2건: 5초 남았을 때
  발급되는 exp가 실제로 그 이하인지, 1ms라도 지났으면 회전 대신 401인지).

### 3개 이상 동시 회전 요청이 정상 세션을 재사용으로 오판하던 문제 (지적 #5)

이전 코드는 "이전 해시(grace) 매치"도 "현재 해시 매치"와 똑같이 다시 회전시켰다. 문제
시나리오: 세션의 현재 해시가 H0인 상태에서 같은 원문(해시 H0)을 든 요청 3개가 거의
동시에 도착하면(다중 탭, 재시도 등) —
1. 요청 A가 먼저 잠금을 잡아 회전: `previous_hash=H0`, `refresh_token_hash=H1`.
2. 요청 B가 H0을 제시 — 이제 `refresh_token_hash`는 H1이라 안 맞고 `previous_hash=H0`은
   맞는다(grace). 여기서 **또 회전**하면: `previous_hash=H1`(!), `refresh_token_hash=H2`.
3. 요청 C가 여전히 H0을 제시 — 이번엔 `refresh_token_hash`(H2)도 `previous_hash`(H1)도
   H0과 맞지 않는다. **정상적인 3번째 동시 요청이 "재사용 탈취"로 오판되어 전체 세션이
   폐기된다.**

수정: grace 매치(`isGraceMatch`)는 더 이상 회전하지 않는다. 새 액세스 토큰만 발급하고
`refreshToken: null`을 반환한다 — `previous_hash` 포인터가 grace 재시도로 인해 앞으로
밀리는 일 자체가 없어지므로, 몇 번을 동시에 재시도해도 재사용 오판이 발생하지 않는다.
컨트롤러는 `refreshToken`이 `null`이면 갱신 쿠키를 Set-Cookie하지 않는다 — 실제로 회전한
형제 요청(fresh match)이 이미 브라우저 쿠키 저장소에 최신 값을 설정했을 수 있는데, grace
응답이 그 값을 되돌려 버리면 안 되기 때문이다.

이 설계가 만족하는 것: 정상적인 동시 요청(다중 탭, 재시도)은 몇 개가 오든 세션을 잃지
않는다. 만족하지 않는 것(A-08, 별도 검증 대상으로 남김): 회전 응답 자체가 완전히
유실됐고 grace 창(30초)마저 지나 버린 경우의 복구는 이번 수정 범위가 아니다 — 재로그인이
필요하다. 실제 DB 동시성 검증은
`backend/tests/db/f03-session.integration.test.js`("R-IMPL #5" 테스트, 같은 원문으로 4개
동시 `authService.refresh()` 호출)가 담당한다: 4개 모두 성공하고, 세션은 폐기되지 않으며,
실제 회전(새 해시 저장)은 정확히 1번만 일어났는지까지 확인한다.

### `useSocket`의 무한 재인증 루프 (지적 #6)

이전 코드는 `reauthExhausted`를 오직 "HTTP 갱신 자체가 실패했을 때"만 세웠다. HTTP 갱신은
매번 성공하는데 소켓 handshake가 계속 UNAUTHORIZED를 돌려주는 상황(예: 쿠키 전파 지연,
그 사이 세션이 다시 폐기됨)에서는 `reauthExhausted`가 절대 설정되지 않아 "갱신 성공 →
재연결 → 다시 UNAUTHORIZED"가 무한 반복될 수 있었다.

수정: handshake 실패 횟수 자체를 `reauthAttempts`로 세고, `MAX_REAUTH_ATTEMPTS`(2회)를
넘으면 갱신 성공 여부와 무관하게 재시도를 멈추고 `logout()` + `/login`으로 리다이렉트한다.
갱신 자체가 실패한 경우도 동일하게 처리한다(기존 동작 유지, 다만 이제 사용자 상태도
정리한다). `cancelled` 플래그로 cleanup(언마운트·로그아웃) 이후에는 늦게 도착한 갱신
응답이 소켓을 재연결하지 못하게 막는다.

프론트 테스트 가능성: `client.js`/`useSocket.js`는 `import.meta.env`(Vite 빌드타임 치환)를
모듈 최상단에서 직접 읽어, 이전에는 "Vite 없이는 이 값을 만들 수 없다"는 이유로 실제
코드를 테스트하지 못했다(빌드 성공으로만 문법을 확인). 이번에 그 참조를
`frontend/src/shared/env.js` 한 파일로 모으고, 두 파일이 그 모듈을 **상대 경로**(`@/...`
Vite 별칭이 아니라 `../env.js`)로 가져오도록 바꿨다 — `node:test`의 `mock.module()`은
resolve된 절대 경로로 모킹 대상을 찾는데, `@/...` 별칭은 Vite 전용이라 플레인 Node에서
아예 resolve되지 않아 모킹도 불가능했기 때문이다(경계 분리). 그 결과 새 테스트가
`client.js`/`useSocket.js`를 실제 코드 그대로 실행해 검증한다:
- `frontend/src/shared/api/__tests__/client.test.js` — `refreshAccessToken()`의 in-flight
  공유(동시 호출은 fetch 1번), 완료 후 재호출 시 새 fetch, 네트워크 오류의 `false` 정규화,
  `apiClient`의 `ACCESS_TOKEN_EXPIRED` 401 정확히 1회 재시도, 갱신 실패 시 재시도 없음,
  `code` 없는 401(로그아웃·정지·재사용 감지)은 갱신을 시도하지 않음.
- `frontend/src/shared/hooks/__tests__/useSocket.test.js` — 정상 케이스(재시도 없음),
  1회 재인증 성공, **갱신은 매번 성공하지만 소켓이 계속 UNAUTHORIZED인 시나리오에서
  상한 이후 재시도를 멈추고 로그아웃하는지**(이번 수정의 핵심 회귀 테스트), 갱신 자체
  실패 시 즉시 로그아웃, UNAUTHORIZED가 아닌 오류는 재시도하지 않음, cleanup 이후 늦게
  도착한 응답이 재연결을 일으키지 않음.

### 정지 감지가 세션을 영구 폐기하지 않던 문제 (지적 #7 일부)

이전 코드는 `checkActiveBan`이 감지되면 그 요청만 401/403으로 거부했다 — `user_sessions`
행 자체는 건드리지 않았다. 그 결과 밴이 나중에 해제되면, 밴 이전에 발급됐고 한 번도
`revoked_at`이 찍히지 않은 기존 세션이 다시 유효한 것으로 통과했다("정지 해제 후 과거
세션 부활").

수정: `sessionLifecycle.resolveSession`, `authService.login`, `authService.refresh` 세
지점 모두 활성 밴을 감지하는 순간 `userRepository.markOnlineSessionsOffline`으로 그
사용자의 모든 세션을 영구 폐기한 뒤에 401/403을 응답한다. 이 저장소에는 밴을
생성/해제하는 관리자 API가 아직 없어(별도 슬라이스), "언제 세션을 죽일지"를 밴 생성
시점에 훅으로 걸 수 없다 — 대신 이 세 지점(사실상 이 계정과 관련된 모든 실제 서버
경로)에서 밴이 처음 감지되는 순간 폐기하는 방식으로 실제 production 경로에 연결했다.
`revoked_at`은 밴 해제로 지워지지 않으므로, 한 번 감지된 뒤에는 밴이 풀려도 그 세션은
계속 거부된다. 실제 DB 검증:
`backend/tests/db/f03-session.integration.test.js`("R-IMPL #7" 테스트) — 정지 감지 시
`revoked_at`이 실제로 찍히는지, 밴을 `destroy()`한 뒤에도 같은 세션이 여전히 거부되는지
확인한다.

### 비밀번호 변경과 동시 로그인의 직렬화, 다른 세션 폐기 (지적 #7 나머지)

기존 `updatePassword`는 `findByUuid` → `comparePassword`를 트랜잭션 **밖**에서 실행한 뒤
비밀번호 갱신 + 세션 폐기만 트랜잭션으로 묶었다. 이 경우 트랜잭션이 유저 행을 잠그지
않으므로, 비밀번호 변경이 진행 중인 사이 같은 계정으로 동시에 들어온 로그인이 (아직
커밋되지 않은) 옛 비밀번호로 통과해 새 세션을 만들 수 있었다 — 그 세션은 비밀번호 변경
트랜잭션의 폐기 UPDATE보다 늦게 생성되므로 폐기 대상에서 빠진다.

수정: `updatePassword`가 `findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE })`로
유저 행을 트랜잭션 시작부터 잠그고, 비밀번호 확인·갱신·세션 전체 폐기를 전부 그 잠금 안에서
수행한다. `authService.login`도 같은 유저 행을 `findByEmail(email, { transaction, lock:
transaction.LOCK.UPDATE })`로 잠그고 로그인 전체(비밀번호 확인 → 세션 생성)를 한 트랜잭션
으로 묶었다 — 두 경로가 같은 행 잠금을 공유하므로 MySQL이 자동으로 직렬화한다: 비밀번호
변경 트랜잭션이 먼저 커밋되면 그 이후의 로그인은 새 비밀번호로만 성공하고, 로그인이 먼저
끝나면 그 세션은 비밀번호 변경의 전체 폐기 대상에 포함된다(로그인 자체가 트랜잭션을
빠져나온 뒤에 완료되므로, 방금 만든 세션이 이미 커밋된 뒤여야 폐기 UPDATE의 WHERE 조건에
걸린다 — 즉 어느 순서로 인터리빙돼도 "옛 비밀번호로 만든 세션이 새 비밀번호 발급 이후에도
살아남는" 경우가 없다). `markOnlineSessionsOffline`은 `is_online` 여부와 무관하게
`revoked_at IS NULL`인 모든 세션을 대상으로 하므로, 이미 다른 로그인으로 오프라인 처리된
이전 세션의 회전형 갱신 자격(refresh_token_hash)도 함께 죽는다. 실제 DB 검증:
`backend/tests/db/f03-session.integration.test.js`("R-IMPL #7/AC-04" 테스트) — 두 번
로그인해 오프라인 세션 A를 만든 뒤, 실제 `PATCH /user/me/password` 라우트로 비밀번호를
바꾸고 A의 갱신 자격도 이후 `refresh()`가 거부하는지, 변경 후에는 새 비밀번호로만
재로그인이 되는지까지 확인한다.

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
- **운영 밴**: `sessionLifecycle.resolveSession`(HTTP·Socket.IO 연결·소켓 후속 이벤트
  공통) + `authService.login`/`authService.refresh` 세 지점 모두 활성 밴을 감지하는 즉시
  그 사용자의 **모든** 세션을 영구 폐기한다(R-IMPL #2 #7 — 위 "정지 감지가 세션을 영구
  폐기하지 않던 문제" 절). 이후 액세스 요청과 갱신 요청 모두 막히고, 밴이 나중에
  해제되어도 이미 폐기된 세션은 되살아나지 않는다.
- **비밀번호 변경**(`backend/controller/profile.controller.js`의 `updatePassword`):
  유저 행을 `FOR UPDATE`로 잠근 트랜잭션 안에서 현재 비밀번호 확인 → `password_hash` 갱신
  → `userRepository.markOnlineSessionsOffline(uuid, {transaction})`(`revoked_at IS NULL`인
  **모든** 세션 — 이미 다른 로그인으로 오프라인 처리된 세션의 회전형 갱신 자격 포함)을
  순서대로 실행한다. 폐기가 실패하면 비밀번호 변경도 커밋되지 않는다. 같은 유저 행 잠금을
  `authService.login`도 공유하므로 동시 로그인과 자동으로 직렬화된다(R-IMPL #2 #7 —
  위 "비밀번호 변경과 동시 로그인의 직렬화" 절). 이 호출은 요청 자신이 사용 중인 세션도
  함께 폐기하므로, 비밀번호 변경 응답 이후 같은 브라우저에서도 재로그인이 필요하다.

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
  뒤 성공 시에만 `socket.connect()`로 재연결한다. handshake 실패 횟수 자체를
  `reauthAttempts`로 제한(`MAX_REAUTH_ATTEMPTS=2`)해, HTTP 갱신은 계속 성공하는데
  소켓만 계속 UNAUTHORIZED인 경우에도 상한 이후에는 재시도를 멈추고 로그아웃 상태로
  정리한다(R-IMPL #2 #6 — 이전에는 갱신 실패 시에만 멈췄다). `cancelled` 플래그로 cleanup
  이후 늦게 도착한 갱신 응답이 재연결을 일으키지 않게 막는다.
- **`backend/socket/socket.js`의 `wrapSocketWithSessionGuard`**: 이미 연결된 소켓에서도
  `disconnect`를 제외한 모든 이벤트 앞에 `sessionLifecycle.resolveSession`을 다시 통과시켜,
  handshake 이후에 일어난 로그아웃·정지·비밀번호 변경을 그 소켓의 다음 동작부터 즉시
  반영한다(AC-09). matchmaking.js·gameSession.js는 건드리지 않았다 — `socket.on`을 감싸는
  방식이라 두 모듈이 등록하는 핸들러에도 자동으로 적용된다.

## 실제 검증 상태 (CODEX-2 반송 대응 세션 기준, 2026-09-10)

- **`node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test`(격리
  MySQL 주입 래퍼) — 이번 세션에서도 미실행.** Bash·PowerShell 두 도구 모두 "승인이
  필요합니다"로 즉시 거부했다(이번 세션 2회 시도, 이전 세션들까지 합치면 누적 5회 이상
  동일하게 차단). 형태를 바꿔 우회하지 않았다 — 자격 JSON을 직접 읽어 동등한 명령을
  재구성하는 시도도 하지 않았다. **다음 시도 또는 루트 운영자가 반드시 이 명령으로
  아래 "이번 세션에서 고친 것"의 DB 시험(R-IMPL #7 확장, AC-03/AC-05 로그아웃 배선,
  R-IMPL #8, 수정된 R-IMPL #7/AC-04)을 재검증해야 한다.** 준비 방법(비밀값 없이):
  `C:/Users/minsa/jokertest/.pluto/monitor/f01-test-db.private.json`이 이미 존재하고,
  이 명령이 실행되면 그 안의 자격으로 `F01_TEST_DATABASE_URL` 환경변수가 주입되어
  `backend/tests/db/*.integration.test.js`가 skip 대신 실제로 실행된다. 강제 시간 경계
  재현은 코드가 아니라 DB 값을 직접 되돌리는 방식(예: `f03-session.integration.test.js`의
  `session.update({ refresh_previous_expires_at: new Date(Date.now() - 1000) })`)을 이미
  테스트 안에 구현해 두었으므로, 이 래퍼 실행 자체 외에 별도 시간 조작은 필요 없다.
- **`node "C:/dev/pluto/packages/daemon/dist/src/impl-check.js" test`(backend, 격리 DB
  없이 실행 가능한 전체 스위트) — 이번 세션에서 여러 차례 실행, 모두 통과.** 최종 실행:
  tests 1062 / pass 1043 / fail 0 / skipped 19(격리 MySQL 없이는 검증 불가능한 F01/F02/F03
  DB 통합 테스트 — "미검증"으로 남는다, PASS로 위장하지 않았다). 로그:
  `backend/.pluto/checks/`(가장 최근 `*-test.log`).
- **`node "...impl-check.js" build`(backend)** — `Missing script: "build"`. 순수 Node
  서버라 빌드 스크립트가 없는 것이 정상(회귀 아님).
- **`node "...impl-check.js" test`(frontend)** — 통과. tests 1199 / pass 1199 / fail 0.
- **`node "...impl-check.js" build`(frontend)** — `vite build` 성공(1021 modules, dist
  생성). 실제 브라우저에서의 로그인 유지·브라우저 재시작·회전 응답 유실 복구·소켓
  재연결 수동 확인은 이 실행 환경(도구 기반 세션)에서 할 수 없다 — 루트 운영자가 직접
  확인해야 한다(AC-01/AC-02/AC-06 manual 부분, 미실행으로 남긴다).

### 이번 세션(CODEX-2 반송 대응)에서 고친 것과 그 근거 테스트

- **AC-01(회전 응답 유실 복구, R-IMPL #8)** — `backend/service/auth.service.js`의 회전
  로직을 무작위 생성(`generateRefreshSecret`)에서 "이전 원문 자격 + 세션ID"에 대한 HMAC
  결정론적 유도(`deriveRotatedRefreshToken`)로 바꿨다. grace(이전 해시) 매치는 더 이상
  `refreshToken: null`을 반환하지 않고, 실제 회전 당시 발급했을 값을 저장 없이 그대로
  재계산해 돌려준다 — 몇 번을 재시도하든, 응답이 어떤 순서로 도착하든, 몇 개가
  동시에 도착하든 항상 같은 값이 나오므로 회전 성공 응답 자체가 유실돼도 다음 재시도가
  그 값을 복구한다. `user.controller.js`의 refresh 핸들러는 이제 매번 Set-Cookie해도
  안전하다(형제 요청의 최신 값을 되돌릴 위험이 없다 — 모두 같은 값이므로).
  근거: `backend/service/auth.service.refresh.test.js`(grace 재시도가 회전을 재실행하지
  않음 + 응답 유실→재시도→복구 왕복이 정확히 같은 값을 내는지 + grace 이후 정상 회전
  확인, 3건 추가/수정), `backend/tests/db/f03-session.integration.test.js`의 수정된
  "R-IMPL #5"(4개 동시 요청이 모두 같은 자격을 받고 그 자격이 실제 저장된 해시와
  일치)와 신규 "R-IMPL #8"(실제 DB로 응답 유실→재시도 복구→grace 이후 정상 회전→grace
  밖 재사용 거부 전 과정 확인) — **격리 MySQL 없이는 이번 세션에서 skip 상태다.**
- **AC-02(영속 쿠키 미발급/제거, R-IMPL #6)** — `backend/auth/cookieOptions.js`에
  `clearRefreshCookie` 추가, `user.controller.js`의 `login`이 `rememberMe`가 아니면
  이전에 남아있을 수 있는 영속 `refreshToken` 쿠키를 명시적으로 지운다. 근거:
  `backend/__tests__/auth.login.regression.test.js`에 실제 Express 앱 + fetch로
  `/auth/login`을 호출해 진짜 `Set-Cookie` 헤더를 읽는 시험 4건 추가 — 유지 선택 시
  Max-Age·HttpOnly·SameSite=Lax·(운영환경) Secure 확인, 미선택 시 Max-Age·Expires 부재
  확인, 이전 영속 쿠키가 실제로 지워지는지(값 비고 과거 Expires, Max-Age 없음) 확인,
  `NODE_ENV=production`에서 Secure가 붙는지 확인. 옵션 객체만 보던 기존
  `cookieOptions.test.js`의 한계를 실제 HTTP 응답 검사로 보완했다.
- **AC-03/AC-05(실제 배선 검증)** — `backend/tests/db/f03-session.integration.test.js`에
  실제 로그인→로그아웃, 실제 로그인→정지(기존 "R-IMPL #7" 확장) 이후 실제 Express
  `/auth/me`·`authService.refresh()`·`socket.js`의 `authenticateSocket`(신규 연결)·
  `wrapSocketWithSessionGuard`(이미 연결된 소켓의 후속 이벤트) 네 경로가 모두 거부되는지
  확인하는 시험을 추가했다 — `sessionLifecycle.resolveSession` 단위 호출만으로 배선
  검증을 대신하지 않는다. 비밀번호 변경 시험("R-IMPL #7/AC-04")에도 변경 요청 세션
  자신의 HTTP·refresh·소켓 거부 확인을 추가했다. **격리 MySQL 없이는 이번 세션에서 skip
  상태다.**
- **AC-04(다른 세션 fixture 결함)** — 기존 시험은 `loginA`를 `loginB`의 로그인 자체가
  이미 폐기(단일 활성 세션 정책)한 뒤 비밀번호 변경으로 다시 폐기됐다고 잘못 단언하고
  있었다. 로그인 정책(새 로그인이 이 계정의 기존 세션을 전부 오프라인·폐기하는 것)은
  바꾸지 않되, "비밀번호 변경 직전까지 실제로 유효했던 다른 세션"을 `db.UserSession.create`
  로 직접 시딩(로그인 경로를 거치지 않아 그 정책의 영향을 받지 않는다)하도록 고쳤다.
  변경 이전에는 `authService.refresh()`로 그 세션의 자격이 실제로 통과함을 먼저 확인한
  뒤, 실제 `PATCH /user/me/password`를 호출하고 나서야 같은 자격이 거부됨을 확인한다 —
  이전에는 증명하지 못했던 "비밀번호 변경이 실제로 그 세션을 폐기했다"는 인과관계를 이제
  증명한다. **격리 MySQL 없이는 이번 세션에서 skip 상태다.**

### 남은 일 / 다음 행동

1. **`run-backend-tests.cjs test`(격리 MySQL) 승인·실행** — 이번 세션이 추가/수정한 DB
   시험(R-IMPL #5/#8, 로그아웃 배선, 정지 배선 확장, R-IMPL #7/AC-04 수정)이 실제 DB에서
   통과하는지 확인해야 한다. 여러 세션에 걸쳐 반복적으로 막힌, 가장 중요한 미완 항목이다.
2. 실제 브라우저에서: 로그인 유지 후 재시작 → 유지, 미선택 후 종료 → 세션쿠키 소멸(및
   이전 영속 쿠키가 실제로 삭제되는지 개발자 도구 Application 탭에서 확인), 액세스 토큰
   (또는 절대 기한 임박) 만료 뒤 자동 갱신·소켓 재연결이 매끄러운지, 네트워크 탭에서
   회전 응답 하나를 인위적으로 차단(예: DevTools의 요청 차단 또는 오프라인 토글)했다가
   복구한 뒤에도 세션이 로그아웃되지 않는지 — 루트 운영자의 수동 확인이 필요하다.

## 실제 검증 상태 (R-IMPL #2 수정 세션 기준, 2026-09-10, 과거 기록)

- **`node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test`(격리
  MySQL 주입 래퍼) — 이번 세션에서 미실행.** Bash·PowerShell 두 도구 모두 이 명령을
  실행하려 할 때마다 "승인이 필요합니다"로 즉시 거부했고, 재시도(3회)에도 승인 상호작용
  경로를 얻지 못했다 — 이전 두 세션이 겪은 것과 같은 종류의 도구 권한 차단이다. **자격
  증명 부재로 단정하지 않는다** — `C:/Users/minsa/jokertest/.pluto/monitor/f01-test-db.private.json`
  이 존재하는 것을 확인했고, 이 명령이 실행되면 그 안의 자격으로 격리 MySQL에 연결된다는
  것도 코드로 확인했다(원문은 출력하지 않았다). 이 반송(R-IMPL #2)이 지적한 실패
  6건(`.pluto/slices/AN/runs/VERIFY-5.json`) — `f01-migrations.integration.test.js`의
  AC-02/AC-03/AC-05(3건, 마이그레이션이 2→3개로 늘어난 것을 반영하지 못한 테스트 자체의
  결함), `auth.sessionGuard.test.js`의 2건, `f02-signup.integration.test.js`의 AC-06(0003
  미적용으로 인한 실제 INSERT 실패) — 은 모두 아래 "이번 세션에서 고친 것" 절에서 코드로
  수정했지만, **이 세션에서는 격리 MySQL로 재실행해 직접 확인하지 못했다.** 다음 시도(또는
  루트 운영자)가 반드시 이 명령으로 재검증해야 한다.
- **`node "C:/dev/pluto/packages/daemon/dist/src/impl-check.js" test`(backend, 격리 DB
  없이 실행 가능한 전체 스위트) — 이번 세션에서 여러 차례 실행, 모두 통과.** 최종 실행:
  tests 1052 / pass 1037 / fail 0 / skipped 15(격리 MySQL 없이는 검증 불가능한 F01/F02/F03
  DB 통합 테스트 — 이름 그대로 "미검증"으로 남는다, PASS로 위장하지 않았다). 로그:
  `backend/.pluto/checks/`(가장 최근 `*-test.log`).
- **`node "...impl-check.js" build`(backend)** — `Missing script: "build"`. 순수 Node
  서버라 빌드 스크립트가 없는 것이 정상(이전 세션들과 동일, 회귀 아님).
- **`node "...impl-check.js" test`(frontend)** — 통과. tests 1199 / pass 1199 / fail 0.
  이전 세션들은 `client.js`/`useSocket.js`가 `import.meta.env`를 직접 참조해 "Vite 없이는
  테스트 불가"로 남겼으나, 이번 세션은 그 참조를 `frontend/src/shared/env.js`로 분리하고
  두 파일의 관련 import를 상대 경로로 바꿔(경계 분리, 위 "R-IMPL #2 수정 내역" 참고) 새
  테스트 두 파일(`client.test.js`, `useSocket.test.js`)에서 실제 로직을 검증한다 — "불가능"
  으로 단정하지 않고 해소했다.
- **`node "...impl-check.js" build`(frontend)** — `vite build` 성공(1021 modules, dist
  생성). 프로덕션 빌드 자체는 통과했지만, 실제 브라우저에서의 로그인 유지·브라우저
  재시작·소켓 재연결 수동 확인은 이 실행 환경(도구 기반 세션)에서 할 수 없다 — 루트
  운영자가 직접 확인해야 한다(AC-01/AC-02/AC-06 manual 부분, 미실행으로 남긴다).

### 이번 세션(R-IMPL #2)에서 고친 것과 그 근거 테스트

- 지적 #3(재사용 감지 폐기 rollback) — `authService.refresh`를 "트랜잭션은 절대 throw하지
  않고 outcome을 반환, 커밋 후에 오류를 던진다" 구조로 재작성.
  `backend/tests/db/f03-session.integration.test.js`("R-IMPL #3")가 실제 DB에 `revoked_at`
  이 커밋되는지 확인(격리 MySQL 없이는 skip — 위 첫 항목 참고).
- 지적 #4(절대 30일 기한 초과) — `cookieOptions.capAccessTokenTtlSeconds`/
  `buildSessionCookieOptions`/`buildRefreshCookieOptions`에 절대 기한 캡 추가,
  `sessionLifecycle.resolveSession`에 DB 기반 절대 기한 검사 추가(소켓 후속 이벤트 포함).
  단위 테스트: `backend/auth/cookieOptions.test.js`(5건 추가),
  `backend/service/auth.service.refresh.test.js`(2건 추가, 경계·반올림 포함).
- 지적 #5(동시 회전 재사용 오판) — grace 매치는 더 이상 회전하지 않도록 수정.
  `backend/service/auth.service.refresh.test.js`(mock 기반, 회전 미실행·null refreshToken
  확인) + `backend/tests/db/f03-session.integration.test.js`("R-IMPL #5", 실제 DB에 4개
  동시 요청).
- 지적 #6(useSocket 무한 루프) — `MAX_REAUTH_ATTEMPTS` 도입, env.js 경계 분리로 실제 로직
  테스트. `frontend/src/shared/hooks/__tests__/useSocket.test.js`(6건),
  `frontend/src/shared/api/__tests__/client.test.js`(6건).
- 지적 #7(정지 시 미폐기, 직렬화 없음) — `resolveSession`/`login`/`refresh` 밴 감지 시
  전체 세션 폐기, `login`/`updatePassword` 유저 행 잠금으로 직렬화.
  `backend/auth/sessionLifecycle.test.js`(밴 시 UPDATE 호출 검증 추가),
  `backend/__tests__/auth.sessionGuard.test.js`(같은 검증, HTTP 경로),
  `backend/__tests__/profile.updatePassword.sessionRevocation.test.js`(트랜잭션 잠금
  반영), `backend/tests/db/f03-session.integration.test.js`("R-IMPL #7",
  "R-IMPL #7/AC-04" — 실제 DB로 밴 해제 후 미복원, 다른 세션 폐기, 재로그인 직렬화 확인).
- 지적 #2(f01/f02 마이그레이션 테스트 결함) —
  `backend/tests/db/f01-migrations.integration.test.js`의 AC-02(0003이 추가한 5개 컬럼을
  기존 컬럼과 분리해 비교), AC-03/AC-05(마이그레이션 개수 2→3, 이름·상태 정확히 비교)를
  수정. `backend/tests/db/f02-signup.integration.test.js`의 `MIGRATIONS`에 0003 추가(AC-06
  실제 로그인 경로가 신규 컬럼을 요구하므로).
- 지적 #10(package-lock.json) — `git status`로 확인한 결과 이번 세션 시작 시점부터
  `backend/package-lock.json`/`frontend/package-lock.json` 모두 변경 없음(clean) — 원복이
  필요한 상태가 아니었다.

### 남은 일 / 다음 행동

1. **`run-backend-tests.cjs test`(격리 MySQL) 승인·실행** — 위 6개 실패가 실제로 해소됐는지,
   그리고 새로 추가한 `f03-session.integration.test.js`(4건)가 실제 DB에서 통과하는지
   확인해야 한다. 이번 세션에서 가장 중요한 미완 항목이다.
2. 실제 브라우저에서: 로그인 유지 후 재시작 → 유지, 미선택 후 종료 → 세션쿠키 소멸,
   액세스 토큰(또는 절대 기한 임박) 만료 뒤 자동 갱신·소켓 재연결이 매끄러운지, 3개 이상
   탭에서 동시 갱신이 실제로 안전한지 — 루트 운영자의 수동 확인이 필요하다.
