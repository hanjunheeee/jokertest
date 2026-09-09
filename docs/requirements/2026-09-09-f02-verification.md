# F-02 회원가입 입력·중복 확인 — 구현 및 검증 증거

날짜: 2026-09-09 (작업 완료: 2026-09-10, 검토 반영: 2026-09-10)
슬라이스: Pluto AM (F-02)

## 검토 반영 (2026-09-10)

CODEX-1.json 검토가 AC-03/AC-05/AC-06을 partial로 반려했다. 반영 내용은
`.pluto/progress.md`에 지적별로 기록했다. 요약: (1) `useEmailAvailabilityCheck`의
뒤늦은 응답 덮어쓰기 버그를 수정, (2) `f02-signup.integration.test.js`가
`F01_TEST_DATABASE_URL` 없이 `node --test`로 직접 실행되면(예: 지시된
`node impl-check.js node-test` 경로) `backend/models` require 시점에 크래시하던
버그를 수정(항상 문법적으로 유효한 `DATABASE_URL` 폴백을 두도록), (3) 같은 파일에
AC-03 시간대별 DB 왕복, AC-05 사전 조회 강제 동기화, AC-06 긴 nickname_snapshot
경기 기록 저장 테스트를 추가했다. 아래 "성공 조건별 근거"와 "미검증 항목"은 이
반영을 반영해 갱신했다.

## 요약

닉네임 길이·문자셋, 생년월일 유효성(시간대 무관 저장), 비밀번호 길이·확인 일치, 이메일
중복 확인(입력 단계 + 최종 제출 단계), 관리 필드 무시를 프론트·서버 양쪽에서 동일한 규칙으로
검증하도록 구현했다.

## 변경 파일

### 처음 정한 범위
- `frontend/src/domains/auth/hooks/useLoginPage.js` — `INITIAL_FORM_DATA`에 `passwordConfirm`/`birthDate` 추가, `handleSubmit`이 제출 전 `validateSignupForm`으로 먼저 걸러낸다. 이메일 중복 확인 상태 로직(`useEmailAvailabilityCheck`)도 여기 추가했다 — SignupFields.jsx가 JSX라 이 저장소의 node:test(JSX 로더 없음)로는 직접 검증할 수 없어서, 순수 훅으로 분리해 테스트 가능하게 만들었다.
- `backend/service/auth.service.js` — `signup()`이 `validateSignupPayload`로 먼저 검증하고, `birth_date`를 `createUser`에 전달한다. `checkEmailAvailability` export를 추가했다(입력 단계 중복 확인용).
- `backend/models/user/user.model.js`, `backend/repositories/user.repositories.js`, `backend/models/game/game_result_player.model.js` — **변경 없음**. `birth_date`는 UTC 자정 Date로만 다루면 Sequelize 기본 `timezone:'+00:00'` 하에서 컬럼 타입 변경 없이도 하루가 밀리지 않아(아래 "AC-03 시간대" 참고) 모델 변경이 불필요했다. `nickname_snapshot`은 이미 F-01(0002-expand-nickname-snapshot.js, `073506f`에서 DB 검증 완료 기록)에서 50자로 확장되어 있어 별도 조치가 필요 없었다.

### 새로 만든 파일 (계획된 4개)
- `frontend/src/domains/auth/validation/signupValidation.js`
- `backend/validation/signupValidation.js`
- `tests/fixtures/f02-signup-validation.json`
- 본 문서

### 따라오는 수정 (파일 4 / 부품 한도 내)
- `backend/routes/auth.routes.js` — `GET /auth/check-email` 라우트 추가.
- `backend/controller/user.controller.js` — `checkEmail` 컨트롤러 추가.
- `frontend/src/domains/auth/api/auth.api.js` — `checkEmailApi` 추가.
- `frontend/src/domains/auth/components/SignupForm/SignupFields.jsx` — `passwordConfirm`/`birthDate` 입력칸, 이메일 중복확인 버튼+메시지 추가(상태 로직은 `useEmailAvailabilityCheck`에 위임).

### 함께 갱신한 테스트 파일
- `backend/__tests__/auth.signup.rollback.test.js` — `SIGNUP_INPUT`을 새 검증 규칙을 통과하는 값으로 갱신(닉네임 1자 → 2~8자, 비밀번호 7자 → 8자 이상 + `passwordConfirm`/`birthDate` 추가). 트랜잭션 롤백/커밋 자체를 검증하는 스위트라 값만 바꿨다.
- `frontend/src/domains/auth/hooks/__tests__/useLoginPage.test.js` — 로그인 payload deepEqual에 새 필드(빈 문자열) 반영, 회원가입 검증 게이팅 4건, `useEmailAvailabilityCheck` 4건(AC-05) 추가. **검토 반영**: 뒤늦은 응답 덮어쓰기 회귀 테스트 1건 추가.
- 신규: `backend/validation/__tests__/signupValidation.test.js`, `frontend/src/domains/auth/validation/__tests__/signupValidation.test.js` (같은 `tests/fixtures/f02-signup-validation.json` 벡터를 각자 돌려 프론트·서버 판정이 같은지 확인 — AC-01).
- 신규: `backend/__tests__/auth.checkEmail.test.js` (`checkEmailAvailability` 단위 테스트, db 스텁).
- 신규: `backend/tests/db/f02-signup.integration.test.js` (AC-05 동시 가입 경합, AC-06 관리 필드 무시 + 재로그인 — 격리 DB 없으면 skip). **검토 반영**: `DATABASE_URL` 폴백으로 크래시 버그 수정, AC-05를 사전 조회 강제 동기화 버전으로 교체, AC-03 시간대별 왕복 테스트와 AC-06 긴 nickname_snapshot 경기 기록 테스트 추가.

## 성공 조건별 근거

- **AC-01** (닉네임 1/9자 거부, 2/8자 허용, 한글/영문/숫자만) — `backend/validation/signupValidation.js`·`frontend/.../validation/signupValidation.js`의 `validateNickname`(정규식 `^[가-힣a-zA-Z0-9]+$`, 2~8자)이 담당. 양쪽 테스트가 `tests/fixtures/f02-signup-validation.json`의 같은 벡터로 통과/거부를 확인함. **검증됨** (`npm test --prefix backend`/`frontend` 전체 통과).
- **AC-02** (한글 IME 조합 중 문자 깨짐 없음) — `handleInputChange`는 `e.target.value`를 그대로 저장하고, 닉네임 검증은 제출 시점에만 실행되도록 남겨 키 입력마다 값을 자르거나 걸러내지 않는다. **미검증** — 실제 브라우저 IME 조합은 자동화 테스트로 확인할 수 없다. 사람이 개발 서버에서 한글 닉네임을 직접 입력해 확인해야 한다.
- **AC-03** (생년월일 필수/형식/미래 거부, 시간대 무관 저장·복원) — `validateBirthDate`가 `parseIsoDateUtc`로 `'YYYY-MM-DD'`를 UTC 자정 `Date`로만 만들고(로컬 타임존 조합을 쓰지 않음), 달력에 없는 날짜(2월 30일 등)는 UTC 필드 롤오버로 걸러낸다. **검증됨**(단위 테스트로 파싱·경계값·미래 날짜 확인). 저장소 왕복(가입 → DB 저장 → `userRepository.findByUuid` 복원)까지는 `f02-signup.integration.test.js`의 "AC-03: birth_date는 서버 시간대와 무관하게 저장·복원된다"가 담당한다 — `process.env.TZ`를 `UTC`/`Pacific/Kiritimati`/`America/Los_Angeles`로 바꿔가며 같은 계정을 다시 조회해 `2000-06-15`가 그대로 복원되는지 확인한다(mysql2 드라이버가 DATETIME을 파싱할 때 프로세스 로컬 시간대를 쓰므로, 실제로 TZ를 바꿔야 의미가 있다). **격리 DB(F01_TEST_DATABASE_URL) 없이는 skip되어 미검증** — 로직·테스트는 갖춰졌으나 이번 실행 환경에는 격리 MySQL이 없다.
- **AC-04** (비밀번호 불일치 거부, 8~64자 서버 적용) — `validatePassword`(길이), `validatePasswordConfirm`(일치) 둘 다 프론트(`validateSignupForm`, 제출 전 게이트)와 서버(`validateSignupPayload`, `auth.service.js`) 양쪽에 있다. **검증됨**.
- **AC-05** (입력 단계·최종 제출 단계 이메일 중복 확인, 확인 후 이메일 변경 시 무효화, 동시 가입 시 하나만 성공) —
  - 입력 단계: `GET /auth/check-email` → `authService.checkEmailAvailability` → `frontend checkEmailApi` → `useEmailAvailabilityCheck`(SignupFields의 "이메일 중복확인" 버튼). 단위 테스트로 available/duplicate/에러 확인.
  - 무효화: `useEmailAvailabilityCheck`가 확인된 이메일과 현재 이메일이 달라지면 `idle`로 되돌림 — `useLoginPage.test.js`의 "확인 이후 이메일을 바꾸면 이전 확인 결과가 무효화된다"로 확인. **검토 반영**: 확인 요청을 두 번 연달아 보낸 뒤(예: 이메일을 바꿔 다시 확인) 먼저 보낸 느린 요청의 응답이 나중에 도착하면 최신 상태를 덮어쓰던 버그를 `latestRequestEmail` ref로 고치고, "AC-05: 이전 이메일의 뒤늦은 응답이 최신 확인 상태를 덮어쓰지 않는다" 테스트로 고정했다.
  - 최종 제출 단계: 기존 `signup()`의 `findByEmail` 사전 검사(유지).
  - 동시 가입: `f02-signup.integration.test.js`의 AC-05 테스트를 "사전 조회가 둘 다 '중복 없음'을 본 뒤에도 DB 유일 제약이 하나만 남긴다"로 강화했다 — `userRepository.findByEmail`을 일시적으로 감싸 두 동시 요청의 사전 조회가 모두 도착한 뒤에야 함께 풀어주므로, 이후의 409가 애플리케이션 계층의 사전 검사가 아니라 반드시 `user.repositories.js`의 `toConflictError`(DB 유일 제약 변환)에서 나왔음을 증명한다. **격리 DB 없이는 skip되어 미검증**.
- **AC-06** (관리 필드 무시, 30→50자 nickname_snapshot으로 저장 실패 없음, 가입 후 재로그인 성공) —
  - 관리 필드 무시: `validateSignupPayload`가 `email/password/passwordConfirm/nickname/birthDate`만 destructure하므로 `role/status/email_verified`는 애초에 반환값에 담기지 않는다. 단위 테스트(`AC-06: role/status/email_verified가 섞인 요청도 value에는 허용된 필드만 남는다`)로 확인. 실제 DB 저장까지는 `f02-signup.integration.test.js`의 AC-06 테스트가 담당하나 **격리 DB 없이는 skip**.
  - nickname_snapshot 30→50: F-01에서 이미 처리·검증 완료(`073506f docs: record completed F01 database verification`, `backend/db/migrations/0002-expand-nickname-snapshot.js`, `backend/models/game/game_result_player.model.js`의 `STRING(50)`). **검토 반영**: F-01의 별도 스위트를 인용하는 데 그치지 않고, F-02 자신의 가입 경로로 만든 계정에 대해 45자 `nickname_snapshot`을 실제 `game_result_players` 저장 경로로 저장·복원하는 테스트("AC-06: 30자를 넘는 nickname_snapshot도 경기 기록 저장 경로에서 잘리지 않는다")를 `f02-signup.integration.test.js`에 추가했다. **격리 DB 없이는 skip되어 미검증**.
  - 재로그인 성공: `f02-signup.integration.test.js`의 AC-06 테스트가 `authService.signup` 이후 `authService.login`을 호출해 확인 — **격리 DB 없이는 skip**.
  - **검토 반영(공통 버그 수정)**: `f02-signup.integration.test.js`는 `backend/models`를 require하는데, `F01_TEST_DATABASE_URL`이 없을 때 `process.env.DATABASE_URL`이 완전히 비어 있으면(`.env.test`를 로드하지 않는 방식으로 이 파일을 실행하는 경우, 예: 지시된 `node impl-check.js node-test` 경로) `new Sequelize(undefined)`가 즉시 예외를 던져 `unavailable(t)`의 "미검증" skip에 도달하기도 전에 파일 전체가 실패로 보였다. `.env.test`와 동일한 더미 값(`mysql://test:test@localhost:3306/test`)으로 폴백하도록 고쳐, 이제 이 명령으로 직접 실행해도 4개 테스트 모두 정상적으로 skip(미검증)로 보고된다(크래시하지 않음). 이 버그는 AC-05/AC-06 담당 테스트 3개 모두에 영향을 줬다.

## 실행한 검증

- `npm ci --prefix backend`, `npm ci --prefix frontend` (node_modules가 없어 먼저 설치).
- `npm test --prefix backend` — **1007개 중 997 통과, 0 실패, 10 skip**(모두 `F01_TEST_DATABASE_URL` 미설정으로 인한 DB 통합 테스트 — 기존 F-01 6건 + F-02 4건(AC-05 강화판, AC-06 2건, AC-03 신규)).
- `npm test --prefix frontend` — **1186개 전부 통과, 0 실패**(AC-05 뒤늦은 응답 회귀 테스트 1건 추가).
- `npm run build --prefix frontend` — 정상 빌드(청크 크기 경고는 기존부터 있던 것으로 이번 변경과 무관).
- `node impl-check.js node-test backend/tests/db/f02-signup.integration.test.js` — 검토 반영 후 크래시 없이 4개 테스트 모두 "미검증" skip으로 정상 보고됨(반영 전에는 이 정확한 명령으로 실행 시 `ERR_INVALID_ARG_TYPE`로 파일 전체가 실패했다).

### 지시서의 `node impl-check.js node-test <file>` 관련 메모

`node impl-check.js node-test backend/__tests__/...test.js`는 `.env.test`를 로드하지 않고
`node --test <file>`만 실행한다. `backend/models/index.js`는 `process.env.DATABASE_URL`이 있어야
하므로(`backend/package.json`의 `test` 스크립트는 `--env-file=.env.test`를 명시), 이 경로로는
DB 모델을 require하는 **모든** backend 테스트가 실패한다 — 이번 변경 전부터 있던 파일
(`auth.login.regression.test.js`)로도 같은 오류를 재현해 확인했다(내 변경으로 생긴 문제가 아님).
이 세션에서는 셸 환경변수 설정(`export`/`env` 접두사/PowerShell `$env:`)이 전부 "승인 필요"로
막혀 우회할 수 없었으므로, 대신 프로젝트가 이미 갖춘 `npm test --prefix backend`/`--prefix frontend`
(둘 다 이 저장소의 표준 테스트 명령이며 `.env.test`를 올바르게 로드한다)를 "다른 허용 명령"으로
실행해 전체 스위트 통과를 확인했다. `node impl-check.js node-test`는 DB를 전혀 요구하지 않는
개별 검증 모듈 테스트(`backend/validation/__tests__/signupValidation.test.js`)에서는 정상 동작을 확인했다.

## 미검증 항목 (사람이 확인해야 함)

1. **AC-02**: 실제 브라우저에서 한글 닉네임 IME 조합이 끊기지 않는지.
2. **AC-03/AC-05/AC-06의 DB 통합 테스트 4건** (`f02-signup.integration.test.js`): 테스트는 갖춰졌으나 이번 실행 환경에 `F01_TEST_DATABASE_URL`이 가리키는 격리 MySQL이 없어 모두 skip으로 기록됨. 격리 MySQL이 있는 환경에서 그대로 실행하면 된다.
3. 실제 개발 서버에서 회원가입 폼(이메일 중복확인 버튼, 비밀번호 확인, 생년월일 선택, 최종 제출)을 사람이 눌러보는 회귀 확인.

## 복구 절차

이번 슬라이스는 기존 DB 스키마를 변경하지 않았다(신규 마이그레이션 없음, `birth_date` 컬럼은
F-01 기준선에 이미 존재). 롤백이 필요하면 이 슬라이스가 바꾼 파일만 되돌리면 되고, 별도의
DB 복구 절차는 필요 없다.
