# F-31 기능 설계도 — 회원가입 이메일 인증

> F-31을 나눈 **모든 조각(CA·CG·BP)** 의 계획·계획 검증에 같이 붙는다. 조각은 자기 몫만 구현한다.
> 여기 확정된 경로·필드·담당은 **계약**이다 — 조각의 계획은 이것을 바꾸지 않고, 부족한 점은 고치지 말고 `unsure`에 근거와 함께 남긴다.
> 작성 2026-09-20. 선행: F-29(메일 어댑터 `backend/mail/mailAdapter.js`, 빈도 제한 `backend/middleware/rateLimit.js` — [F-29 설계도](F-29-account-recovery.md) §2-4·§2-5). 이 둘을 **재사용**하고 새로 만들지 않는다. 실제 이름이 다르게 병합됐으면 병합된 것을 따른다.

## 1. 이미 있는 것 (소비만 한다)

| 무엇 | 어디 | 핵심 |
|---|---|---|
| 가입 | `POST /auth/signup` (`backend/routes/auth.routes.js:12`) → `backend/controller/user.controller.js:66` → `backend/service/auth.service.js::signup` (:81) | 검증 → 계정 생성 → 기본 지급. 롤백 시험 `backend/__tests__/auth.signup.rollback.test.js`, DB 시험 `backend/tests/db/f02-signup.integration.test.js` |
| 이메일 중복 확인 | `GET /auth/check-email` (:13) | 그대로 둔다 |
| `users.email_verified` | `backend/models/user/user.model.js:15` (기본 false) | 지금은 `backend/service/socialAuth.service.js:259`만 쓴다 |
| 소셜 가입 | `POST /auth/social/signup/complete` (:25), `socialSignupIntent` 모델 | 제공자가 확인한 이메일을 가진다 |
| 가입 화면 | `frontend/src/domains/auth/pages/LoginPage.jsx`(가입 모드), `components/SignupForm.jsx`, `components/SignupForm/SignupFields.jsx`, 훅 `hooks/useLoginPage.js`(`signupApi` 호출 :174) | 별도 가입 라우트 없음 |
| 검증 규칙 공유 | `backend/validation/signupValidation.js` ↔ `frontend/src/domains/auth/validation/signupValidation.js`, 공용 벡터 `tests/fixtures/f02-signup-validation.json` | |

## 2. F-31이 확정하는 계약

### 2-1. HTTP API (`/auth` 아래, 로그인 불필요)
| 메서드·경로 | 요청 | 응답 | 담당 |
|---|---|---|---|
| `POST /auth/signup/email-code` | `{email}` | `{ok:true, resendAfterSec, expiresInSec}` — 이미 가입된 이메일이어도 **같은 응답**(메일은 보내지 않거나 '이미 가입됨' 안내 메일) / 429 `RATE_LIMITED` / 400 `INVALID_INPUT` / 재발송 대기 중 `RESEND_TOO_SOON`(+남은 초) | CA |
| `POST /auth/signup/email-code/verify` | `{email, code}` | `{ok:true, signupProof, expiresInSec}` / `CODE_INVALID`(+남은 시도) · `CODE_EXPIRED` · `TOO_MANY_ATTEMPTS` | CA |
| `POST /auth/signup` (기존) | 기존 필드 + **`signupProof`** | 증명 없음·불일치·만료·이미 소비: `SIGNUP_PROOF_REQUIRED`/`SIGNUP_PROOF_INVALID`. 증명의 이메일과 제출 이메일이 다르면 거부 | CA |

### 2-2. 서버 규칙 (CA)
- 초깃값은 **서버 설정**: 6자리 숫자, 10분 유효, 재발송 60초, 오입력 5회, 재발송 시 이전 번호 무효. 이메일당 5회/시간·10회/일, IP당 30회/시간·100회/일. 가입 증명 10분.
- 새 테이블(새 마이그레이션, 러너 CLI `backend/scripts/migrate-db.js`에 등록): 이메일·목적(`SIGNUP`)·검증값·만료·시도 횟수·소비 여부·증명 검증값·증명 만료. 번호와 증명은 **서버 비밀값을 섞은 검증값(HMAC)** 으로 저장하고 원문을 DB·로그·불필요한 응답에 남기지 않는다(`signupProof` 원문은 verify 응답에 한 번만 나간다).
- 가입 제출: **증명 소비·계정 생성·기본 지급을 같은 트랜잭션**으로. 동시 제출에도 가입은 정확히 한 번. 성공한 계정은 `email_verified = true`.
- 비밀번호 재설정 증명(F-29)과 가입 증명은 목적이 달라 서로 쓸 수 없다.
- 기존 계정은 추가 인증 없이 그대로 이용한다. 기존 미인증 계정을 `email_verified=true`로 **이관하지 않는다**.
- 메일은 F-29 어댑터의 템플릿 `SIGNUP_CODE`.

### 2-3. 화면 (CG)
- 가입 폼에 단계 추가: 이메일 입력 → '인증번호 받기' → 번호 입력·확인 → (확인 완료 후에만) 가입 제출 가능.
- 표시: 재발송 대기 카운트다운(60초)·만료·오입력 남은 횟수/초과·요청 제한·통신 실패·재시도. **이메일을 바꾸면 인증 상태와 증명을 초기화**한다.
- `signupProof`는 컴포넌트/훅 상태에만 둔다 — localStorage·sessionStorage·zustand persist·로그에 남기지 않는다.
- API 함수는 `frontend/src/domains/auth/api/auth.api.js`에 추가: `requestSignupCodeApi`, `verifySignupCodeApi`. `signupApi`는 `signupProof`를 실어 보낸다.

### 2-3a. 가입 화면의 인증 상태 전이 (CG)
> 아래 표는 2026-09-21 추가 — F-27b(CE) 첫 심사의 생산 코드 결함 2건이 모두 설계도가 한 줄로만 적은 화면 동작(사건 순서·오류 분기)에서 나왔다. 화면은 **상태 × 사건 → 다음 상태·부작용**으로 적는다. 표에 없는 조합은 '상태 유지·부작용 없음'이다. **서버 응답이 계약에 없는 형태(200인데 `ok`가 true가 아님, 알 수 없는 `code` 등)면 성공으로도 특정 실패로도 단정하지 않는다 — 통신 실패와 같은 재시도 가능 상태로 처리하고 입력을 유지한다**(F-29c 첫 심사 지적). 표에 여러 사유가 한 상태로 모이는 경우(예: `INVALID`·`EXPIRED`·`USED` → `linkInvalid`)에도 **사유별로 다른 안내 문구**를 보여 준다.

인증 상태는 가입 폼의 하위 상태다. `signupProof`와 인증번호는 컴포넌트/훅 상태에만 둔다.

| 상태 | 사건 | 다음 상태 | 부작용 |
|---|---|---|---|
| `unverified` | '인증번호 받기'(이메일 형식 통과) | `sending` | `requestSignupCodeApi` 1회 |
| `sending` | 재클릭 | `sending` | 추가 호출 없음 |
| `sending` | `ok:true` | `codeSent` | 재발송 카운트다운 시작(`resendAfterSec`), 만료 시각 기록(`expiresInSec`) |
| `sending` | `RESEND_TOO_SOON` | `codeSent` | 남은 초로 카운트다운 |
| `sending` | 429 | `unverified` | 요청 제한 안내 |
| `sending` | 네트워크 오류·5xx | `unverified` | 재시도 가능 안내 |
| `codeSent` | 번호 확인 제출 | `verifying` | `verifySignupCodeApi` 1회 |
| `codeSent` | 재발송(카운트다운 0) | `sending` | 이전 번호는 무효(서버). 입력한 번호를 지운다 |
| `codeSent` | 재발송(카운트다운 > 0) | `codeSent` | 호출 없음(버튼 비활성) |
| `codeSent` | 만료 시각 경과 | `codeExpired` | 만료 안내 + 재발송 |
| `verifying` | `ok:true` | `verified` | `signupProof` 보관, 가입 제출 **활성화** |
| `verifying` | `CODE_INVALID` | `codeSent` | 남은 시도 횟수 표시 |
| `verifying` | `CODE_EXPIRED` | `codeExpired` | |
| `verifying` | `TOO_MANY_ATTEMPTS` | `locked` | 재발송만 가능 |
| `verifying` | 네트워크 오류·5xx | `codeSent` | 재시도 가능 안내 |
| **어느 상태든** | **이메일 입력값 변경** | `unverified` | `signupProof`·번호·카운트다운·만료를 **모두 초기화** |
| `verified` | 가입 제출 | (기존 가입 흐름) | `signupApi`에 `signupProof`를 실어 보낸다 |
| `verified` | 가입 응답 `SIGNUP_PROOF_INVALID`·`REQUIRED` | `unverified` | 증명 폐기, 다시 인증 안내 |
| `unverified`·`codeSent`·… (`verified` 아님) | 가입 제출 | 그대로 | **제출 불가**(버튼 비활성 + 안내). 서버 호출 없음 |

### 2-4. 소셜 가입과 통합 (BP)
- Google·Discord 가입: **제공자가 이메일을 확인했다고 알려 준 경우에만** 메일 인증을 건너뛰고 `email_verified=true`. 제공자가 미확인으로 알려 주거나 이메일을 주지 않으면 §2-1의 같은 인증 흐름을 거치게 한다. 제공자 확인 여부를 어디서 읽는지는 `backend/service/socialAuth.service.js`의 실제 값을 확인해 계획에 적는다(추측하지 않는다).
- F-31 전체 통합 시험과 조각 사이 어긋난 곳 보완.

> **마이그레이션을 추가하는 조각 공통(2026-09-21 추가, F-29a 실측)**: 새 마이그레이션은 기존 시험의 전제를 깬다 — (1) `backend/__tests__/schema.existingTables.test.js`가 기존 테이블의 컬럼 타입·NOT NULL을 잠그고 있으므로, 기존 테이블을 바꾸면 그 단언을 **지우지 말고 새 스키마로 갱신**한다. (2) `backend/tests/db/`의 마이그레이션 통합 시험 중 '마지막 마이그레이션이 NNNN'이라는 전제에 기대는 것이 있는지 찾아 같이 고친다(F-29a가 f19 시험을 '0013까지 적용한 상태' 기준으로 바꿨다 — 그 방식을 따른다). (3) `backend/scripts/migrate-db.js`에 import 등록. (4) **기존 모델(특히 `users`)에 NOT NULL 컬럼을 더하면**, `backend/tests/db/`의 통합 시험 중 **자기만의 마이그레이션 부분집합으로 스키마를 세우고 그 모델의 `create()`를 부르는 파일**(예: `f03-session`의 `MIGRATIONS` 상수)이 `Unknown column`으로 깨진다 — 그런 파일을 전부 찾아 새 마이그레이션(과 그것이 참조하는 선행 마이그레이션)을 목록에 더한다(F-29b 실측: 전체 시험에서 8건 실패). 계획의 시험 항목에 이 넷을 명시하고, 구현은 done 전에 실행기로 `tests/db` 전체를 f01-migrations를 맨 앞에 두고 한 번 돌린다.

## 3. 조각별 담당

| 조각 | 담당 | 하지 않는 것 |
|---|---|---|
| **CA — F31a (서버)** | §2-1·§2-2 전부 | 화면. 소셜 가입 |
| **CG — F31b (화면)** | §2-3 전부 | 서버 코드 |
| **BP — F31 본 조각** | §2-4 | CA·CG의 재구현 |

## 4. 시험으로 고정할 것

| 계약 | 증명 방식 | 담당 |
|---|---|---|
| 발송→확인→증명→가입 성공 | API+DB 시험(메모리 메일 어댑터에서 번호를 읽는다) | CA |
| 만료·오입력 5회·재발송 뒤 옛 번호·주소 변경 거부 | 가짜 시계 API 시험 | CA |
| 증명 없는 직접 가입 거부, 재설정 증명으로 가입 불가 | API 시험 | CA |
| 동시 제출 단일 가입 + 기본 지급 회귀 | DB 시험(격리 DB, `f01-migrations` 먼저) | CA |
| 번호·증명 원문이 DB·로그에 없음 | DB 시험 + 로그 캡처 | CA |
| 빈도 제한 | 가짜 시계 | CA |
| 기존 가입 시험의 갱신 | `f02-signup`·`auth.signup.rollback`·`useLoginPage` 시험이 증명을 요구하도록 **같이 고친다**(단언을 지우지 말고 증명을 준비해 통과시키는 쪽으로) | CA(서버)·CG(프런트) |
| 인증 전 제출 불가·각 상태 표시·주소 변경 시 초기화·증명이 저장소에 없음 | 실제 컴포넌트·훅 마운트 시험 + production build | CG |
| 소셜 가입 분기 | 서비스 시험 | BP |

## 5. 열어 둔 것
- 실제 메일 수신 — 외부 입력 대기, 미검증으로 남긴다.
- 수치(자릿수·유효 시간·한도)는 위임된 초깃값이며 설정으로 바꿀 수 있게만 한다.
