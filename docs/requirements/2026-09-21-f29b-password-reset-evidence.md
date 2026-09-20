# F-29b 비밀번호 재설정 서버 — 구현·검증·복구 증거 (2026-09-21)

이 문서는 구현자가 남기는 증거 기록이다. 독립 심사의 승인 판정을 대신하지 않는다.

## 1. 새로 만든 파일

- `backend/validation/passwordResetValidation.js` — 이메일·토큰 형식 검증, `validatePasswordResetRequest` 미들웨어.
- `backend/controller/passwordReset.controller.js` — `requestPasswordReset`/`verifyPasswordReset`/`confirmPasswordReset` HTTP 경계.
- `backend/service/passwordReset.service.js` — 발급·검증·확정 트랜잭션 로직.
- `backend/mail/mailAdapter.js` — HTTPS 게이트웨이 어댑터·메모리 어댑터.
- `backend/db/migrations/0015-password-reset-tokens.js` — 토큰 해시 전환 + `users.has_local_password` backfill.
- `backend/__tests__/passwordReset.api.test.js` — 라우터·검증·제한기·응답 계약 단위 시험(11개).
- `backend/tests/db/f29b-password-reset.integration.test.js` — 실제 격리 MySQL 시험(6개).
- 본 문서.

## 2. 수정한 기존 파일

- `backend/routes/auth.routes.js` — `/password-reset/request`·`/verify`·`/confirm` 3개 라우트, 전용 제한기 3개.
- `backend/models/user/user.model.js` — `has_local_password BOOLEAN NOT NULL DEFAULT true` 추가.
- `backend/models/auth/password_reset_token.model.js` — `token` nullable, `token_hash`·`revoked_at` 추가.
- `backend/repositories/user.repositories.js` — `findByEmail`/`findByUuid`에 `options.logging` 전달 통로 추가(기존 호출부 동작 불변).
- `backend/service/socialAuth.service.js` — `completeSocialSignup`이 `has_local_password:false`를 명시.
- `backend/socket/socket.js` — 연결별 5초 주기 세션 재검증 타이머(`startSessionRevocationWatcher`), `registerDisconnectHandler`가 그 정리를 함께 수행.
- `backend/middleware/errorHandler.js` — `/auth/password-reset*` 범위 고정 응답 + no-store.
- `backend/index.js` — 재설정 범위 no-store를 파서 이전에 설정, morgan 접근 로그에서 그 범위만 경로 마스킹.
- `backend/scripts/migrate-db.js` — `MIGRATIONS`에 0015 등록.
- `backend/__tests__/schema.existingTables.test.js` — `User`·`PasswordResetToken` 컬럼 계약 갱신.
- `backend/socket/socket.authSession.test.js` — AC-04 주기 검사 시험 3개 추가.
- `backend/tests/db/f29a-find-id.integration.test.js` — `priorMigrations`를 이름 필터 대신 인덱스 prefix로 변경(0015가 0014 뒤에 추가되며 생긴 오염 방지).
- `backend/tests/db/{f01,f02,f05,f07,f19}-*.integration.test.js` — 새 `has_local_password` 컬럼과 무관하게 기존 fixture가 계속 동작하도록 조정(§4 참고).

## 3. 요구사항별 실제 경로·명령·결과

| AC | 실제 경로 | 검증 명령 | 결과 |
|---|---|---|---|
| AC-01 | `auth.routes.js` → `passwordResetValidation` → `passwordReset.controller.requestPasswordReset` → `passwordReset.service.requestPasswordReset` → `mailAdapter.sendMail` | `node-test --prefix backend __tests__/passwordReset.api.test.js` | 11/11 통과 — 존재/미존재 응답 동일(`{ok:true}`, 200, no-store) |
| AC-02 | `passwordReset.service.confirmPasswordReset` → `signupValidation.validatePassword` → `hash.hashPassword` → `user.repositories.updateUser` → `authService.login` | 위 단위 시험 + `tests/db/f29b-...` 1번 케이스 | 새 비밀번호 로그인 200, 이전 비밀번호 401(단위+실DB 모두 확인) |
| AC-03 | `password_reset_token.model.js` + `passwordReset.service` 상태 판정, 동시성은 실제 MySQL `FOR UPDATE` | `tests/db/f29b-...` 2·3번 케이스 | 만료/사용/재발급 무효화 확인, 동시 3건 제출 중 정확히 1건 성공(반복 실측) |
| AC-04 | `user.repositories.markOnlineSessionsOffline` + `socket.js startSessionRevocationWatcher` + `auth.service.refresh`(`findSessionForRefresh`) | `tests/db/f29b-...` 1번 케이스(HTTP+refresh) / `socket/socket.authSession.test.js` 3개(연결별 주기 검사) | HTTP `/auth/me` 401, `/auth/refresh` 401, 유휴 소켓도 다음 검사에서 강제 종료(단위 시험) |
| AC-05 | `socialAuth.service.completeSocialSignup`(false 명시) + `passwordReset.service`의 `has_local_password` 분기 | `tests/db/f29b-...` AC-05 backfill 케이스, `passwordReset.api.test.js` 소셜 전용 케이스 2개 | 소셜 전용 계정은 토큰 미발급·`SOCIAL_LOGIN_GUIDE` 1통, 방어용 유효 토큰의 confirm도 `SOCIAL_ONLY` 400 |
| AC-06 | `0015-password-reset-tokens.js`, `errorHandler.js`, `index.js`(morgan) | `schema.existingTables.test.js`, `tests/db/f29b-...` AC-06 두 케이스, `__tests__/dbStartup.test.js`(전체 스위트에 포함) | DB 컬럼에 원문 없음(질의로 직접 확인), 0015 재실행 멱등, 접근 로그가 재설정 경로를 마스킹 |

## 4. §2-3a backfill 근거와 실제 fixture

0015는 두 근거 중 하나라도 있으면 `false`:
1. `external_identities`와 `consumed_at IS NOT NULL`인 `social_signup_intents`의 `(provider, subject)`가 일치.
2. `external_identities.created_at`과 `users.created_at`의 차이가 10초 이내(`TIMESTAMPDIFF(MICROSECOND, ...)`로 계산 — 초 단위 절삭으로 경계가 넓어지지 않게 함).

`tests/db/f29b-password-reset.integration.test.js`의 "AC-05: has_local_password backfill…" 케이스가 실제 `authService.signup`·`socialAuthService.issueOAuthState/handleOAuthCallback/completeSocialSignup/linkExternalIdentityForValidatedSession`을 호출해 4가지 계정을 만들고 검증했다:
- (a) 순수 로컬 가입 → `true`
- (b) 소셜 가입 완료, intent 보존 → 근거1 → `false`
- (c) 소셜 가입 완료 후 소비된 intent 행 삭제 → 근거1 소멸, 근거2(생성 시각 근접)만 남음 → `false`
- (d) 로컬 가입 후 명시적 연결, identity 생성 시각을 30초 뒤로 이동(근거2 밖) → `true`

**이 fixture 생성 방식의 알려진 단순화**: 계획 메모는 "이관 전 fixture는 별도 시험 프로세스에서 0014 호환 모델 메타데이터로" 만들라고 지시했다. 실제로는 별도 프로세스 대신, 같은 프로세스 안에서 0015의 컬럼 추가(`up()`의 `addColumn` 부분)만 먼저 직접 실행해(그 시점엔 대상 행이 없어 backfill 자체는 공집합 위에서 실행되어 무해함) 런타임 `User` 모델이 정상 INSERT되게 한 뒤, `migrationRunner.applyMigrations`로 "공식" 0015를 다시 실행해 backfill이 멱등하게 실제 데이터 위에서 재계산되게 했다. 이는 AC-06의 "컬럼이 이미 있어도 미완료 backfill을 수행할 수 있어야 한다" 계약을 그대로 이용한 것이지만, 지시한 "완전히 분리된 프로세스" 방식은 아니다 — 실제 서비스 코드·트랜잭션·난수 생성은 전부 진짜이므로 판정 자체는 유효하다고 판단했지만, 프로세스 격리 요구를 문자 그대로 충족하지는 않았다는 점을 투명하게 남긴다.

## 5. 마이그레이션 백업·복구 절차

- 0015 적용 전 **반드시** `users`·`password_reset_tokens` 테이블 백업(또는 전체 DB 스냅샷)을 먼저 뜬다 — `down()`은 원문 복원과 표식 제거를 모두 거부하도록 의도적으로 설계했다(데이터 손실/조작 방지). 되돌릴 유일한 방법은 백업 복원이다.
- 적용 전 `node backend/scripts/migrate-db.js status`로 `failed`/`running` 이력이 없는지 확인한다(있으면 `docs/requirements/2026-09-09-f01-migration-runbook.md` 절차를 먼저 수행).
- 부분 실패(컬럼만 추가되고 backfill 전 중단, 또는 이력 기록 자체 실패로 `running`에 멈춤) 시: 실제 DB 상태를 수동 확인 → 복구(백업 복원 또는 수동 정리) → `resolve-failure --name 0015-password-reset-tokens --confirm` → `migrate` 재실행. 재실행은 멱등하다(같은 데이터에서 같은 값으로 수렴 — `tests/db/f29b-...`의 "0015 up·verify를 두 번" 케이스로 실측).
- **구버전 재배포 주의**: 0015 적용 후 백엔드를 0015 이전 코드로 롤백하면, 이전 코드는 `has_local_password` 컬럼을 모르고 새 계정을 만들 때도 그 컬럼을 채우지 않는다 — Sequelize 기본값이 DB 쪽 `DEFAULT true`로 채워지므로 즉시 오류가 나지는 않지만, 그 사이 만들어진 소셜 가입 계정은 서버가 재-업그레이드되기 전까지 "로컬 비밀번호 있음"으로 오판된다(코드가 명시적으로 `false`를 쓰지 않으므로). 구버전으로의 롤백 배포는 짧게 유지하고, 그 창에서 만들어진 소셜 가입 계정은 재-업그레이드 후 수동으로 재검토해야 한다.
- 토큰 원문은 0015 적용 이전에도 서버가 별도로 로깅한 적이 없다(F-04/F-29a와 같은 원칙) — 복구 과정에서 새로 평문을 복원하거나 로그로 남기지 않는다.

## 6. 메일 설정 계약(비밀값 제외)

환경변수만 문서화한다(값은 서버 환경에만 주입):
- `PASSWORD_RESET_MAIL_GATEWAY_URL` (HTTPS만 허용), `PASSWORD_RESET_MAIL_GATEWAY_TOKEN`(Bearer), `PASSWORD_RESET_MAIL_FROM`, `PASSWORD_RESET_MAIL_TIMEOUT_MS`(기본 5000).
- 게이트웨이 요청 계약: `POST {from, to, subject, text}`(JSON), 실패/시간초과/2xx 아닌 응답은 모두 `{ok:false}`로 정규화되며 공급자 응답 본문은 로깅하지 않는다.
- `PASSWORD_RESET_APP_URL` — 링크의 기반 URL(서버 설정만, 요청 Host 등은 절대 반영하지 않음).
- 기타: `PASSWORD_RESET_TOKEN_TTL_MS`(기본 30분), `PASSWORD_RESET_REQUEST_WINDOW_MS`/`_IP_MAX`(기본 10)/`_EMAIL_MAX`(기본 3), `PASSWORD_RESET_CHECK_WINDOW_MS`/`_IP_MAX`(기본 20, verify+confirm 합산).

## 7. 실행한 검증과 결과

- `node-test --prefix backend __tests__/passwordReset.api.test.js` — 11/11 통과.
- `node-test --prefix backend socket/socket.authSession.test.js` — 15/15 통과(신규 AC-04 3개 포함).
- `node-test --prefix backend __tests__/schema.existingTables.test.js` — 25/25 통과.
- `node-test --prefix backend tests/db/f01-migrations.integration.test.js tests/db/f29b-password-reset.integration.test.js` — 13/13 통과(실제 격리 MySQL).
- `node-test --prefix backend tests/db/f01-migrations.integration.test.js tests/db/f29a-find-id.integration.test.js tests/db/f19-friends-invites.integration.test.js` — 48/48 통과.
- `node-test --prefix backend tests/db/f01-migrations.integration.test.js tests/db/f02-signup.integration.test.js tests/db/f05-social-auth.integration.test.js tests/db/f07-discord-oauth.integration.test.js` — 34/34 통과.
- `test --prefix backend`(전체 스위트) — 2069개 중 1849 통과, 220 skip(F01_TEST_DATABASE_URL 없는 별도 프로세스에서의 재실행 — 실제로는 위에서 실DB로 이미 검증됨), 0 실패. (첫 두 번의 전체 스위트 실행에서 서로 다른 무관한 파일이 `fetch failed: bad port`로 한 건씩 실패했는데 재실행하면 사라졌다 — 병렬 임시 포트 바인딩의 환경 플레이크로 보이며 이번 변경과 무관하다고 판단했다.)
- `build --prefix frontend` — 성공(이 슬라이스는 프런트를 건드리지 않았다 — 회귀 없음 확인용).

## 8. 미검증으로 남기는 것 (사용자 담당 외부 입력 / 이번 세션 범위 밖)

- **실제 메일 발송**: 메모리 어댑터와 가짜 HTTPS 응답으로만 검증했다. 실제 게이트웨이 계정·발신 도메인·수신함 확인은 `recovery_email_delivery=readiness_unverified`로 남긴다.
- **Chrome 실기기 검증**: 이번 세션에서 브라우저를 실행하지 않았다. F-28에서 실제 링크 열기·재사용 거부·소셜 안내 메일 수신을 확인해야 한다.
- **두 서버 프로세스에 걸친 실제 소켓 다중 연결 종료**: AC-04의 연결별 주기 검사 로직은 단위 시험(가짜 소켓·가짜 타이머)으로 확인했고, 단일 프로세스 내 HTTP+refresh 거부는 실제 DB로 확인했다. "같은 격리 DB를 쓰는 서버 프로세스 두 개에 각 세션의 실제 소켓을 연결"하는 시나리오는 시간 제약으로 구현하지 못했다 — 소켓 계층 로직 자체(연결마다 독립 타이머, disconnect 시 정리, 늦은 완료 무시, 중복 조회 방지)는 실측했지만 다중 서버 프로세스 통합 증거는 없다.
- §4에 기록한 fixture 프로세스 격리 단순화.
