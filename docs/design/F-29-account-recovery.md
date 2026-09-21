# F-29 기능 설계도 — 아이디 찾기·비밀번호 재설정

> F-29를 나눈 **모든 조각(BW·BX·CF·BM)** 의 계획·계획 검증에 같이 붙는다. 조각은 자기 몫만 구현한다.
> 여기 확정된 경로·필드·담당은 **계약**이다 — 조각의 계획은 이것을 바꾸지 않고, 부족한 점은 고치지 말고 `unsure`에 근거와 함께 남긴다.
> 작성 2026-09-20, 기준 커밋 `38f958a3`. 줄 번호는 그 시점의 위치다. F-31(가입 메일 인증)이 §2-4의 메일 어댑터를 공유한다.

## 1. 이미 있는 것 (소비만 한다)

| 무엇 | 어디 | 핵심 |
|---|---|---|
| 인증 라우터 | `backend/routes/auth.routes.js`, `backend/index.js:53`에서 **`/auth`** 로 마운트(`/api/auth` 아님) | signup :12, check-email :13, login :14, refresh :18, logout :21 |
| 비밀번호 규칙 | `backend/validation/signupValidation.js::validatePassword` (:76) | 8~64자, bcrypt 72바이트. 닉네임 정규화 `validateNickname` (:46), 생년월일 `validateBirthDate` (:62) |
| 해시 | `backend/utils/hash.js::hashPassword` (:6) | bcrypt |
| 사용자 모델 | `backend/models/user/user.model.js` | `email`(unique), `nickname`(unique), `birth_date`(DATE, null 가능), `password_hash`, `email_verified`. 소셜 계정은 별도 `externalIdentity` 모델 |
| **모든 세션 폐기** | `backend/repositories/user.repositories.js::markOnlineSessionsOffline(user_id, options)` (:122) | 그 사용자의 미폐기 세션에 `revoked_at`을 찍는다. `options.transaction`을 받는다 |
| 소켓 쪽 반영 | `backend/socket/socket.js` — 주기적 세션 재검사(:97)가 `resolveSession` 실패 시 `socket.disconnect(true)` (:104) | **폐기 즉시 끊는 방송은 없다.** 주기 검사로 끊긴다 |
| 기존 비밀번호 변경의 세션 폐기 선례 | `backend/controller/profile.controller.js::updatePassword` (:64), 시험 `backend/__tests__/profile.updatePassword.sessionRevocation.test.js` | 같은 방식으로 폐기한다 |
| 미사용 모델 2개 | `backend/models/auth/password_reset_token.model.js`(`user_id, token, expired_at, used, created_at`), `account_find_request.model.js`(`email NOT NULL, request_type, ip_address, created_at`) | **런타임 코드가 없다**(기준 마이그레이션과 스키마 시험만 참조) |
| 마이그레이션 | `backend/db/migrations/NNNN-이름.js`(현재 0013까지), 러너 `backend/db/migrationRunner.js`, CLI `backend/scripts/migrate-db.js`(**새 마이그레이션은 이 파일에 import를 추가해야 등록된다**) | `up`은 재실행 안전, `verify()` 포함 |
| 로그인 화면 | `frontend/src/domains/auth/pages/LoginPage.jsx`(로그인·가입 겸용), `components/LoginForm/LoginOptions.jsx:11`에 **연결 안 된 '비밀번호 찾기' 버튼**. '아이디 찾기' 버튼은 없다 | 로그인 전 라우트는 `frontend/src/app/routes/index.jsx`의 `/`, `/login` 둘뿐 |
| API 클라이언트 | `frontend/src/domains/auth/api/auth.api.js` | `loginApi`, `signupApi` 등 |
| **없는 것** | 메일 전송 코드·의존성 **없음**. HTTP 빈도 제한 미들웨어 **없음** | 둘 다 F-29가 만든다 |

## 2. F-29가 확정하는 계약

### 2-1. HTTP API (모두 `/auth` 아래, 로그인 불필요)
| 메서드·경로 | 요청 | 응답 | 담당 |
|---|---|---|---|
| `POST /auth/find-id` | `{nickname, birthDate}`(YYYY-MM-DD) | 일치: `{ok:true, maskedEmail}` / 그 밖 전부(불일치·계정 없음·생년월일 미등록): **같은** `{ok:false, code:'NOT_FOUND'}` / 제한: 429 `RATE_LIMITED` / 형식 오류: 400 `INVALID_INPUT` | BW |
| `POST /auth/password-reset/request` | `{email}` | 계정 유무·메일 장애와 무관하게 **같은** `{ok:true}` / 429 `RATE_LIMITED` / 400 `INVALID_INPUT` | BX |
| **`GET /auth/password-reset/verify?token=…`** (정정 2026-09-21 — 병합된 F-29b 구현 기준) | 쿼리 `token` | `{ok:true, status:'VALID'}` 또는 `{ok:false, code:'INVALID'｜'EXPIRED'｜'USED'}` — **토큰을 소비하지 않는다**(몇 번을 불러도 토큰 행·비밀번호·세션 불변) | BX |
| `POST /auth/password-reset/confirm` | `{token, newPassword}` | `{ok:true}` / `INVALID`·`EXPIRED`·`USED`·`INVALID_PASSWORD`·`SOCIAL_ONLY` | BX |

- **정정(2026-09-21)**: 이 설계도의 첫 판은 verify를 POST·body로 적었으나 병합된 F-29b(`backend/routes/auth.routes.js:93`, `passwordReset.controller.js::verifyPasswordReset`)는 **GET·쿼리**로 구현했고 양쪽 심사와 전체 시험을 통과했다. **병합된 것을 계약으로 삼는다** — verify는 토큰을 소비하지 않으므로 메일 미리보기·링크 프리페치가 GET을 불러도 무해하고(요구사항의 '링크를 여는 GET만으로 사용 처리하지 않는다' 충족), 서버 요청 로그는 `backend/index.js`의 URL 마스킹이 `?token=`을 가린다(F-29b의 실제 index.js 로그 캡처 시험이 고정). 토큰을 **소비하는** 것은 `confirm`(POST·body)뿐이다. F-29c(CF)와 BM은 이 GET 계약을 그대로 쓰고 서버를 바꾸지 않는다.
- 응답·로그에 전체 이메일, 사용자 UUID, 토큰 원문, 생년월일 원문을 넣지 않는다.
- 소셜 전용 계정(판정은 §2-3a의 `users.has_local_password = false`): `request`는 같은 `{ok:true}`를 주되 메일은 '제공자 로그인 안내'를 보내고 토큰을 만들지 않는다. `confirm`에 그런 계정의 토큰이 올 수는 없지만 방어적으로 `SOCIAL_ONLY`.

### 2-2. 이메일 마스킹 (BW)
- 서버에서만 마스킹한다. 로컬 부분: 1자면 `*`, 2자면 첫 글자+`*`, 3자 이상이면 첫 글자 + `*`(나머지 길이와 무관하게 3개 고정) + 마지막 글자. 도메인은 첫 글자 + `***` + 최상위 도메인(`.com` 등)만 남긴다. 어떤 길이에서도 원문 전체가 복원되지 않아야 한다.
- 닉네임 대조는 `validateNickname`과 같은 정규화를 쓰되 **신규 가입의 8자 제한은 조회에 적용하지 않는다**(기존 긴 닉네임 계정).

### 2-3. 토큰 (BX)
- 원문: 암호학적 난수 32바이트(base64url). **DB·로그에 원문을 저장하지 않는다** — SHA-256 해시만 저장한다.
- `password_reset_tokens`를 재사용·마이그레이션한다(새 마이그레이션 0014 이후 번호): `token_hash`(unique) 추가, 기존 `token` 컬럼은 더 쓰지 않고 **기존 행은 전부 무효 처리**(used=true 또는 동등)한다. `revoked_at` 또는 동등한 폐기 표식. 계정 데이터는 건드리지 않는다.
- 유효기간 기본 30분(서버 설정). 새 요청이 오면 그 사용자의 이전 미사용 토큰을 폐기한다.
- `confirm`은 **한 트랜잭션**: 비밀번호 규칙 검사 → 해시로 토큰 행 잠금 조회 → 상태 판정 → 사용 처리 → `password_hash` 갱신 → `markOnlineSessionsOffline(user_id, {transaction})` → 남은 토큰 폐기 → 커밋. 동시 제출은 정확히 하나만 성공. 계정 정지·권한 상태는 바꾸지 않는다.
- 링크 주소는 **서버 설정의 앱 기본 URL** + `/password-reset?token=…`. 클라이언트가 보낸 목적지로 만들지 않는다.

### 2-3a. 로컬 비밀번호 보유 여부 (BX) — 운영자 대행 확정 2026-09-21
배경(코드에서 확인): `backend/service/socialAuth.service.js::completeSocialSignup`(:231~)은 소셜 가입 계정에도 `users.password_hash`에 **난수 비밀번호의 해시**를 넣는다(NOT NULL이라서). 그래서 `password_hash`만으로는 '소셜 전용 계정'과 '로컬 비밀번호 계정'을 구분할 수 없다 — §2-1의 `SOCIAL_ONLY` 분기에 사용자별 근거가 필요하다(BX 계획이 이 공백으로 3회 반려됐다).

- 새 컬럼 **`users.has_local_password`** BOOLEAN NOT NULL DEFAULT true (BX의 마이그레이션에 포함).
- **기존 행 backfill**(마이그레이션 안, 재실행 안전): 아래 둘 중 하나에 해당하는 사용자는 `false`, 나머지는 `true`.
  1. 그 사용자의 `user_external_identities` 행 중 `(provider, subject)`가 **소비된**(`consumed_at IS NOT NULL`) `social_signup_intents` 행과 일치하는 것이 있다 — 소셜 가입 완료로 만들어진 계정이라는 직접 근거(같은 트랜잭션에서 사용자·identity·intent 소비가 함께 기록된다, socialAuth.service.js:252~268).
  2. (intent 행이 남아 있지 않은 경우의 보조 근거) 외부 identity의 `created_at`이 그 사용자 `created_at`으로부터 **10초 이내**다 — 소셜 가입은 한 트랜잭션에서 둘을 만든다. 로그인한 기존 계정에 나중에 연결한 identity(`linkExternalIdentityForValidatedSession`)는 이 조건에 들지 않는다.
  - 두 근거가 서로 어긋나는 행은 없다(1이 참이면 2도 참). 어느 근거에도 들지 않으면 로컬 계정으로 본다. `verify()`는 `has_local_password IS NULL`인 행이 0임과, 근거 1에 해당하는 사용자가 모두 `false`임을 확인한다. 기존 계정의 다른 데이터는 건드리지 않는다.
- **유지 규칙**: 로컬 가입(`auth.service.js::signup`) → `true`(기본값) / 소셜 가입 완료(`completeSocialSignup`) → `false`를 명시해 생성 / 기존 계정에 소셜 연결 → 바꾸지 않음 / 비밀번호 변경(`profile.controller.js::updatePassword`, 현재 비밀번호를 요구하므로 로컬 계정만 가능) → `true` 유지 / 재설정 `confirm` 성공 → `true` 유지.
- **재설정에서의 사용**: `request` — 계정이 있고 `has_local_password = false`면 토큰을 만들지 않고 `SOCIAL_LOGIN_GUIDE` 메일만 보낸다(응답은 같은 `{ok:true}`). `confirm` — 토큰의 사용자가 `false`면 `SOCIAL_ONLY`(비밀번호를 바꾸지 않는다). 소셜 전용 계정에 새 로컬 비밀번호를 발급하거나 계정을 병합하지 않는다.
- 시험: 실제 fixture로 (a) 로컬 가입 계정, (b) 소셜 가입 계정, (c) 로컬 가입 뒤 소셜을 연결한 계정을 만들고 backfill·request·confirm의 분기를 DB 시험으로 고정한다. backfill의 두 근거를 각각 따로 검증한다(intent가 있는 경우 / intent 행을 지운 경우).
- `schema.existingTables.test.js`의 users 컬럼 잠금에 이 컬럼을 추가한다(아래 '마이그레이션 공통' 주의).

### 2-4. 메일 어댑터 (BX가 만들고 F-31이 공유)
- `backend/mail/mailAdapter.js`: `sendMail({to, template, params}) → {ok, id?}`. 구현 둘 — 설정 기반 실제 전송(설정이 없으면 '설정 미비'로 실패를 돌려준다. 비밀값은 환경 설정에만), **테스트용 메모리 어댑터**(보낸 메일을 배열에 쌓아 시험이 읽는다).
- 템플릿 키로 목적을 구분한다: `PASSWORD_RESET`, `SOCIAL_LOGIN_GUIDE`, (F-31) `SIGNUP_CODE`. 목적이 다른 증명은 서로 쓸 수 없다.
- 실제 서비스 계정·발신 주소·앱 기본 URL은 외부 입력 — 없으면 테스트 어댑터로 검증하고 실제 수신은 **미검증**으로 남긴다.

### 2-5. 빈도 제한 (BW가 만들고 BX·F-31이 공유)
- `backend/middleware/rateLimit.js`: `createRateLimiter({windowMs, max, keyOf})` — 메모리 기반, 시계 주입 가능(시험). 키는 IP와 정규화한 조회 대상(닉네임 또는 이메일의 해시)의 조합.
- 기본값(서버 설정): find-id IP당 10회/10분·대상당 5회/10분 / reset request 이메일당 3회/시간·IP당 10회/시간 / verify·confirm IP당 20회/10분.
- 초과 시 429 `{ok:false, code:'RATE_LIMITED'}`. 제한 여부로 계정 존재가 드러나지 않게 **계정 유무와 무관하게** 센다.

### 2-6. 조회 기록 (BW)
- `account_find_requests`를 마이그레이션으로 보완: `email`을 NULL 허용으로, `request_type`에 `FIND_ID`·`PASSWORD_RESET` 기록. 생년월일 원문·전체 이메일을 남기지 않는다(필요하면 대상의 해시).

### 2-7. 화면 (BW: 아이디 찾기 / CF: 재설정)
- 로그인 전 라우트 추가: `/find-id`(BW), `/password-reset/request`·`/password-reset`(CF, 뒤쪽이 메일 링크 도착 화면). `frontend/src/app/routes/index.jsx`에 `/login`과 같은 급으로 둔다.
- 기존 인증 UI 리소스(입력·버튼·배경)를 재사용한다. 로그인 화면에 '아이디 찾기' 진입을 추가(BW)하고 기존 '비밀번호 찾기' 버튼을 연결(CF)한다.
- API 함수는 `auth.api.js`에 추가: `findIdApi`(BW), `requestPasswordResetApi`·`verifyPasswordResetApi`·`confirmPasswordResetApi`(CF).
- 상태 표시: 결과 없음·요청 제한·통신 실패·재시도·뒤로 가기(BW) / 요청 완료 공통 안내·링크 무효·만료·이미 사용·소셜 전용 안내·완료 뒤 로그인 이동(CF). 새 비밀번호는 프런트 `signupValidation`의 같은 규칙으로 미리 검사한다.

### 2-8. 화면 상태 전이
> 아래 표는 2026-09-21 추가 — F-27b(CE) 첫 심사의 생산 코드 결함 2건이 모두 설계도가 한 줄로만 적은 화면 동작(사건 순서·오류 분기)에서 나왔다. 화면은 **상태 × 사건 → 다음 상태·부작용**으로 적는다. 표에 없는 조합은 '상태 유지·부작용 없음'이다.

**아이디 찾기 화면 (BW)**

| 상태 | 사건 | 다음 상태 | 부작용 |
|---|---|---|---|
| `idle` | 입력 변경 | `idle` | 형식 검사 결과만 갱신(닉네임 비어 있음·생년월일 형식). 서버 호출 없음 |
| `idle` | 제출(형식 통과) | `submitting` | `findIdApi` 1회. 제출 버튼 비활성 |
| `idle` | 제출(형식 실패) | `idle` | 해당 입력 아래 안내. 서버 호출 없음 |
| `submitting` | 제출 재클릭 | `submitting` | **추가 호출 없음** |
| `submitting` | 응답 `ok:true` | `found` | 마스킹 이메일 표시. 입력값은 화면 상태에서 지운다 |
| `submitting` | 응답 `NOT_FOUND` | `notFound` | 어느 입력이 틀렸는지 드러내지 않는 공통 안내 |
| `submitting` | 429 `RATE_LIMITED` | `rateLimited` | 잠시 뒤 다시 시도 안내. 자동 재시도하지 않는다 |
| `submitting` | 400 `INVALID_INPUT` | `idle` | 입력 안내 |
| `submitting` | 네트워크 오류·5xx | `failed` | 재시도 버튼 |
| `failed`·`rateLimited`·`notFound` | 재시도/다시 입력 | `idle` | 직전 입력 유지(생년월일 포함 — 화면 상태에만) |
| 어느 상태든 | 뒤로 가기 | (로그인 화면) | 진행 중 요청의 결과는 버린다(언마운트 뒤 상태 갱신 없음) |

**재설정 요청 화면 (CF)**

| 상태 | 사건 | 다음 상태 | 부작용 |
|---|---|---|---|
| `idle` | 제출(이메일 형식 통과) | `submitting` | `requestPasswordResetApi` 1회 |
| `submitting` | 응답 `ok:true` | `sent` | "가입된 이메일이면 메일을 보냈다"는 **공통 안내**(계정 유무를 드러내지 않는다) |
| `submitting` | 429 | `rateLimited` | 안내 |
| `submitting` | 네트워크 오류·5xx | `failed` | 재시도 버튼 |
| `sent` | 다시 보내기 | `submitting` | 같은 호출 1회(서버가 빈도 제한) |

**링크 도착 화면 (CF)** — 진입 시 URL의 `token`을 읽는다. 토큰은 화면 상태에만 두고 저장소·로그에 남기지 않는다.

| 상태 | 사건 | 다음 상태 | 부작용 |
|---|---|---|---|
| `checking` | 마운트 | `checking` | `verifyPasswordResetApi`(GET `/auth/password-reset/verify?token=`) **정확히 1회**(StrictMode 이중 마운트에도 1회 — 소비하지 않는 호출이지만 빈도 제한을 아낀다). 토큰은 `encodeURIComponent`로 실어 보낸다 |
| `checking` | `VALID` | `ready` | 새 비밀번호·확인 입력 표시 |
| `checking` | `INVALID`·`EXPIRED`·`USED` | `linkInvalid` | 각 사유 안내 + 다시 요청하기 링크 |
| `checking` | 토큰 없음 | `linkInvalid` | 서버 호출 없음 |
| `ready` | 제출(규칙 8~64자·72바이트·확인 일치 통과) | `submitting` | `confirmPasswordResetApi` 1회 |
| `ready` | 제출(규칙 실패) | `ready` | 입력 안내. 서버 호출 없음 |
| `submitting` | 재클릭 | `submitting` | 추가 호출 없음 |
| `submitting` | `ok:true` | `done` | 완료 안내 뒤 로그인으로 이동. 비밀번호 입력값을 지운다 |
| `submitting` | `INVALID_PASSWORD` | `ready` | 입력 안내 |
| `submitting` | `INVALID`·`EXPIRED`·`USED` | `linkInvalid` | 사유 안내 |
| `submitting` | `SOCIAL_ONLY` | `socialOnly` | 제공자 로그인 안내 |
| `submitting` | 네트워크 오류·5xx | `ready` | 재시도 가능 안내(입력 유지) |

> **마이그레이션을 추가하는 조각 공통(2026-09-21 추가, F-29a 실측)**: 새 마이그레이션은 기존 시험의 전제를 깬다 — (1) `backend/__tests__/schema.existingTables.test.js`가 기존 테이블의 컬럼 타입·NOT NULL을 잠그고 있으므로, 기존 테이블을 바꾸면 그 단언을 **지우지 말고 새 스키마로 갱신**한다. (2) `backend/tests/db/`의 마이그레이션 통합 시험 중 '마지막 마이그레이션이 NNNN'이라는 전제에 기대는 것이 있는지 찾아 같이 고친다(F-29a가 f19 시험을 '0013까지 적용한 상태' 기준으로 바꿨다 — 그 방식을 따른다). (3) `backend/scripts/migrate-db.js`에 import 등록. (4) **기존 모델(특히 `users`)에 NOT NULL 컬럼을 더하면**, `backend/tests/db/`의 통합 시험 중 **자기만의 마이그레이션 부분집합으로 스키마를 세우고 그 모델의 `create()`를 부르는 파일**(예: `f03-session`의 `MIGRATIONS` 상수)이 `Unknown column`으로 깨진다 — 그런 파일을 전부 찾아 새 마이그레이션(과 그것이 참조하는 선행 마이그레이션)을 목록에 더한다(F-29b 실측: 전체 시험에서 8건 실패). 계획의 시험 항목에 이 넷을 명시하고, 구현은 done 전에 실행기로 `tests/db` 전체를 f01-migrations를 맨 앞에 두고 한 번 돌린다.

## 3. 조각별 담당

| 조각 | 담당 | 하지 않는 것 |
|---|---|---|
| **BW — F-29a** | find-id API·마스킹·조회 기록 마이그레이션·**빈도 제한 미들웨어(§2-5)**·아이디 찾기 화면과 라우트 | 비밀번호 재설정 전부 |
| **BX — F-29b** | 재설정 API 3개·토큰 마이그레이션·**메일 어댑터(§2-4)**·세션 폐기. BW의 빈도 제한을 **재사용** | 화면. 아이디 찾기 |
| **CF — F-29c** | 재설정 화면 2개·라우트·API 함수·'비밀번호 찾기' 버튼 연결 | 서버 코드 |
| **BM — F-29 본 조각** | 로그인 화면 두 진입에서 끝까지 가는 **통합 시험**(실제 라우터·API·테스트 메일 어댑터), 재설정 뒤 기존 HTTP 세션 거부와 소켓 세션이 주기 검사로 끊기는 것, 조각 사이 어긋난 곳 보완 | 앞 세 조각의 재구현. 남은 것이 없으면 통합 시험과 보완만이 계획이다 |

## 4. 시험으로 고정할 것

| 계약 | 증명 방식 | 담당 |
|---|---|---|
| find-id의 공통 안내 | API 시험 — 불일치·없는 계정·생년월일 미등록의 응답 본문·상태 코드가 **완전히 같음** | BW |
| 마스킹 | 단위 시험 — 로컬 1·2·3·긴 길이, 짧은 도메인에서 원문 복원 불가 | BW |
| 빈도 제한 | 가짜 시계 — 한도 초과 429, 창이 지나면 회복, 계정 유무와 무관 | BW |
| request의 동일 응답 | 있는 이메일·없는 이메일·메일 장애에서 응답 동일, 메일은 있는 계정에만 1통 | BX |
| 원문 미저장 | DB 시험 — 메모리 어댑터가 받은 링크의 원문이 어느 컬럼에도 없음 | BX |
| 이전 링크 폐기·verify 비소비 | DB/API 시험 | BX |
| 동시 confirm 단일 성공 | DB 시험(격리 DB, `f01-migrations` 먼저) — 성공 정확히 1, 비밀번호 갱신 1회 | BX |
| 세션 폐기 | 세션 2개 → 재설정 → 둘 다 보호 API 401 | BX |
| 마이그레이션 | 재실행 안전·`verify()`·기존 행 보존 | BW·BX |
| 화면 상태들 | 실제 컴포넌트·훅 마운트 시험 + production build | BW·CF |
| 끝에서 끝 | 통합 시험 | BM |

## 5. 열어 둔 것
- 실제 메일 서비스 계정·발신 주소·앱 기본 URL — 외부 입력 대기. 실제 수신은 미검증으로 남긴다.
- 빈도 제한 수치·토큰 유효기간은 기본값이며 설정으로 바꿀 수 있게만 한다.
- 실제 브라우저 확인 — F-28.
