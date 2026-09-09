# F-03 세션 정책 및 검증 기록 — 로그인 유지·세션 만료

## 정책 요약

- **로그인 유지(rememberMe === true)**: `accessToken` 쿠키에 Max-Age 30일
  (`PERSISTENT_SESSION_MAX_AGE_MS`, `backend/auth/cookieOptions.js`)을 설정하고,
  액세스 토큰(JWT) 자체의 만료(`exp`)도 같은 30일로 발급한다(`backend/service/auth.service.js`
  `login()`). 이 30일은 로그인 시점 기준 **절대 만료**이며, 이후 어떤 요청으로도 연장되지
  않는다 — 재로그인 전까지 고정된 창이다.
- **로그인 유지 미선택**: `accessToken` 쿠키는 Max-Age/Expires가 없는 세션 쿠키로
  발급되고, 액세스 토큰도 기존과 동일하게 1일 후 만료된다.
- **세션 유효성 재검사**: `user_sessions.is_online`과 활성 밴 여부는 매 보호 요청마다
  캐시 없이 다시 조회한다(`backend/auth/sessionLifecycle.js`의 `resolveSession`).
  HTTP(`auth.middleware.js`의 `verifyToken`)와 Socket.IO(`socket.js`의
  `authenticateSocket`)가 이 함수를 그대로 공유하므로, 로그아웃·타 기기 재로그인·운영
  밴이 다음 요청부터 두 경로 모두에 즉시 반영된다(AC-05).

## AC-06 — 세션 쿠키 방식과 "브라우저 종료 즉시 서버 세션 폐기" 방식의 차이

이번 구현은 **세션 쿠키(Max-Age 없음) 방식**을 쓴다.

- 브라우저가 완전히 종료되면 브라우저가 쿠키 저장소에서 세션 쿠키를 지운다. 그 클라이언트는
  이후 `accessToken`을 다시 보낼 수 없으므로, 결과적으로 로그인이 풀린 것과 같은 효과를 낸다.
- 그러나 이것은 **"브라우저 종료를 서버가 감지해 그 순간 `user_sessions.is_online`을
  `false`로 내리는 것"과 다르다.** 서버는 브라우저가 실제로 닫혔는지 알 방법이 없다 — HTTP는
  상태가 없고, Socket.IO의 `disconnect` 이벤트는 새로고침·일시적 네트워크 단절과 구분되지
  않는다(`backend/socket/socket.js`의 `handleDisconnect` 주석 참고: 과거에 disconnect가
  인증 세션까지 내렸다가 새로고침만으로 로그아웃되는 회귀가 있었고, 그 이후 disconnect는
  presence만 내리고 인증 세션(`is_online`)은 건드리지 않도록 고정했다).
- 따라서 이 구현에서 `user_sessions` 행은 브라우저 종료만으로 즉시 폐기되지 않는다. 명시적
  로그아웃, 같은 계정의 타 기기 재로그인(`markOnlineSessionsOffline`), 운영 밴에 의해서만
  폐기된다.
- 결과적으로 **"세션 쿠키가 사라져 클라이언트가 더 이상 인증할 수 없게 되는 것"이 로그인
  유지 미선택 시의 실질적 만료 수단**이고, 서버 측 `user_sessions` 행 자체는 그보다 늦게
  (또는 다른 계정 활동 시점에) 정리될 수 있다. 이는 의도된 트레이드오프다. 서버가 브라우저
  종료를 능동적으로 감지해 즉시 세션 행을 폐기하는 방식을 원한다면, 별도의 하트비트/TTL
  스키마 설계가 필요하며 이번 슬라이스의 범위 밖이다.

## AC-01 설계 — 계획 메모(A-03)와 달라진 점

원래 계획 메모(A-03)는 무작위 갱신 비밀값을 서버에는 해시로만 저장하고, 만료 전 이를
회전(rotate)시키는 refresh-token 방식을 전제했다. 구현 시점에 다음을 확인했다:

- `backend/__tests__/schema.existingTables.test.js`가 `user_sessions`의 컬럼 목록·타입·
  기본키·NOT NULL을 정확히 고정해 두는 회귀 스냅샷 테스트를 이미 가지고 있다. 이 슬라이스의
  범위에서 `user_sessions`에 컬럼을 추가하면 그 회귀 테스트와 충돌한다.
- 새 컬럼(또는 새 테이블)을 실제 DB에 반영하려면 마이그레이션이 필요한데, 마이그레이션
  작성·검증은 이 슬라이스의 승인된 수정 범위 밖이다.

그래서 이번 구현은 로그인 유지 시 **액세스 토큰(JWT) 자체의 만료를 30일로 늘리는 것**으로
AC-01을 만족시킨다. 별도의 갱신 비밀값이나 새 스키마가 없어도, 세션 폐기(로그아웃·밴)는
여전히 매 요청 DB 재검사(`resolveSession`)로 즉시 반영되므로 토큰의 긴 수명이 보안 저하로
이어지지 않는다. 다만 이 설계는 "액세스 토큰이 실제로 짧게 살고 별도 자격으로 갱신된다"는
회전형 refresh-token 패턴은 아니다 — 나중에 회전형 갱신 자격이 필요해지면 그 스키마 변경은
별도 마이그레이션 슬라이스에서 진행해야 한다.

## AC-03/AC-04 — 비밀번호 변경 트리거

- 로그아웃(`user.controller.js`의 `logout` → `recordLogout`)과 운영 밴
  (`sessionLifecycle.resolveSession`의 `checkActiveBan` 재검사, HTTP·Socket.IO 공통)은
  이번 구현으로 AC-03/AC-05를 만족한다.
- 비밀번호 변경 시 기존 세션을 전부 폐기하는 호출(AC-04, AC-03의 세 번째 트리거)은 확장
  승인 이후 `backend/controller/profile.controller.js`의 `updatePassword`에 연결했다.
  `password_hash` 갱신(`userRepository.updateUser`)과 전체 세션 폐기
  (`userRepository.markOnlineSessionsOffline(uuid)`)를 `userRepository.withTransaction`
  하나로 묶어, 폐기가 실패하면 비밀번호 변경도 커밋되지 않는다 — 그렇지 않으면 변경 이전에
  탈취된 세션이 새 비밀번호 발급 이후에도 유효하게 남는다. 이 호출은 요청 자신이 사용 중인
  세션도 함께 폐기하므로, 비밀번호 변경 응답 이후 같은 브라우저에서도 재로그인이 필요하다.

## `markOnlineSessionsOffline`의 트랜잭션 옵션

`backend/repositories/user.repositories.js`의 `markOnlineSessionsOffline(user_id, options)`
은 두 번째 인자로 `{ transaction }`을 받도록 확장했다(기본값 `{}`). 로그인 시 중복 세션
정리처럼 트랜잭션 없이 호출하는 기존 경로는 그대로 동작하고, 비밀번호 변경처럼 원자성이
필요한 경로만 `transaction`을 넘긴다.

## 실제 검증 상태

아래는 이번 작업 트리에서 격리 없이 실행 가능한 단위/통합 테스트로 검증한 것이고, 실제
브라우저 재시작·프로덕션 빌드·격리 MySQL을 통한 마이그레이션 재실행/복구는 이 슬라이스의
실행 환경에서 수행하지 않았다(`docs/requirements/2026-09-09-f01-migration-runbook.md` §7과
같은 이유로 격리 MySQL 자격 증명을 구할 수 없음).

- AC-01/AC-02: `backend/__tests__/auth.login.regression.test.js` — `rememberMe`에 따라
  액세스 토큰의 `exp - iat`가 30일/1일로 갈리는지 확인.
- AC-02: `backend/auth/cookieOptions.test.js` — `rememberMe=false`일 때 쿠키에
  `maxAge`/`expires`가 없는지 확인(기존 테스트, 변경 없음).
- AC-03/AC-05: `backend/__tests__/auth.sessionGuard.test.js`(HTTP, 기존 테스트 변경 없이
  통과) + `backend/socket/socket.authSession.test.js`(Socket.IO, 이번에 추가한 케이스) —
  폐기된 세션·정지된 계정이 HTTP와 Socket.IO 양쪽에서 같은 `sessionLifecycle.resolveSession`
  기준으로 거부되는지 확인.
- AC-05: `backend/auth/sessionLifecycle.test.js` — 공유 검증 함수 자체의 단위 테스트.
- AC-03/AC-04: `backend/__tests__/profile.updatePassword.sessionRevocation.test.js` —
  비밀번호 변경 성공 시 새 비밀번호와 세션 전체 폐기가 같은 트랜잭션으로 커밋되는지,
  폐기 실패 시 비밀번호 변경도 함께 롤백되는지(원자성), 현재 비밀번호가 틀리면 트랜잭션
  자체를 열지 않는지, 그리고 비밀번호 변경 이후 같은 세션의 토큰으로 보낸 후속 보호 요청이
  거부되는지(재로그인 요구)를 확인한다.
