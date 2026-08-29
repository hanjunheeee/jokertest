# Joker QA3 — 로그인 유지와 새로고침 세션 복구

## 배경

실제 브라우저에서 `로그인 상태 유지`를 체크한 계정이 방에 참가한 뒤 `/game-matching`을 새로고침하면 `/login`으로 이동했다. 체크값은 로그인 요청이나 쿠키에 반영되지 않고, socket transport disconnect가 명시적 로그아웃과 같은 DB 세션 폐기를 수행한다.

## 재현

1. `로그인 상태 유지`를 체크해 로그인한다.
2. 방에 생성 또는 참가하고 `/game-matching`을 새로고침한다.
3. `/auth/me`, socket 재연결, `get_current_room` 복구와 최종 경로를 확인한다.
4. 체크하지 않은 로그인, 명시적 로그아웃, 중복 로그인 강제 종료도 각각 비교한다.

## 요구사항

- `rememberMe` 선택을 로그인 API 계약에 포함하고 backend가 선택에 따라 persistent cookie와 session cookie를 구분해야 한다.
- 새로고침·일시 네트워크 단절·socket 재연결은 인증 DB 세션을 폐기하지 않아야 한다.
- 명시적 `/auth/logout`만 현재 인증 세션을 오프라인 처리하고 쿠키를 제거해야 한다. 다른 유효 세션을 무조건 함께 종료하지 않는다.
- socket disconnect는 presence와 게임 disconnect-grace 처리를 유지하되 인증 세션의 `is_online`을 변경하지 않는다.
- 새로고침 후 `/auth/me`가 성공하고, 대기 중이면 `get_current_room`, 게임 중이면 기존 game-session snapshot 경로로 복구되어야 한다.
- 중복 로그인 정책과 `force_disconnect` 보안 동작은 회귀하지 않아야 한다.
- 토큰, 쿠키 값, 비밀번호를 로그나 오류 payload에 남기지 않는다.

## 성공 조건

- 체크한 로그인은 브라우저 재시작에 견디는 `Max-Age` 또는 `Expires` 쿠키를 발급하고, 체크하지 않은 로그인은 session cookie를 발급한다.
- 두 경우 모두 같은 탭 새로고침은 로그인과 현재 방/게임 컨텍스트를 복구한다.
- 명시적 로그아웃 뒤 `/auth/me`는 401이고, 단순 socket disconnect 뒤에는 성공한다.
- backend auth/socket 단위·통합 테스트와 frontend 로그인/복구 테스트, 양쪽 전체 관련 테스트 및 frontend production build가 통과한다.
- 실제 브라우저에서 로그인 → 방 참가 → 새로고침 → 같은 방 복구를 확인하고 스크린샷을 남긴다.

## 예상 범위

- `frontend/src/domains/auth/hooks/useLoginPage.js`
- `frontend/src/domains/auth/api/auth.api.js`
- `backend/controller/user.controller.js`
- `backend/socket/socket.js`
- `backend/repositories/user.repositories.js`
- 관련 auth/socket/frontend 테스트

DB schema/migration을 추가하지 않고 기존 세션 모델을 사용한다.
