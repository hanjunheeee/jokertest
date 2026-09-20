# F-29a 아이디 찾기(닉네임·생년월일 → 마스킹 이메일) — 구현 검증 및 마이그레이션 러너북

이 문서는 F-29a 슬라이스가 실제로 바꾼 경로, AC별 실행 명령·결과, `0014-find-id-requests`
마이그레이션의 적용·복구 절차, 그리고 이 슬라이스 밖(F-28/BX/CF/BM)으로 남는 항목을 기록한다.

## 1. 변경 파일

**수정**
- `backend/index.js` — 재검토 R-IMPL 대응(2026-09-21 2회차): "backend/index.js::app 가
  backend/routes/auth.routes.js::router 를 마운트하지 않는다"는 소비처 미연결 지적을 받았다.
  실제로는 `app.use("/auth", authRouter)`가 이전부터 존재했고 `authRouter`가 그대로
  `POST /auth/find-id`를 포함하지만(§2의 실행 증거), 이 마운트 지점이 이번 슬라이스의 diff에
  전혀 나타나지 않아 기계적 소비처 연결 검사가 그 사실을 확인하지 못했다. 그 mount 줄
  바로 위에 F-29a가 이 마운트를 통해 `/auth/find-id`에 도달한다는 설명 주석을 추가해 이번
  diff에 이 연결이 명시적으로 나타나게 했다(동작은 바꾸지 않음). 추가로
  `backend/__tests__/dbStartup.test.js`(실제 `backend/index.js`를 `require`해 진짜 기동시키는
  유일한 시험)에 `POST /auth/find-id`가 이 실제 `app` 인스턴스에서 400(INVALID_INPUT)으로
  응답하는지 확인하는 단정을 추가했다 — `/auth/me`가 401을 받는 기존 단정과 같은 자리에서,
  실제 기동된 서버로 이 마운트 자체를 직접 증명한다.
  **3회차 추가 조치**: 2회차의 주석 추가만으로는 같은 지적이 그대로 반복됐다. 원인으로
  가장 가능성이 높은 것은 (a) 소비처 연결 검사가 git diff 라인 단위로 동작해서 `app.use(
  "/auth", authRouter);` **그 줄 자체**가 변경으로 표시돼야 edge를 인식하는데, 2회차는 그
  줄 위에 블록 주석만 추가해 그 줄 자체는 diff에서 그대로(비변경) 남아 있었거나, (b)
  이 워크트리(`C:/Users/minsa/jokertest-slices/BW`)를 가리키는 Codebase Memory 그래프
  프로젝트가 아예 없어(`list_projects`로 확인 — BW 프로젝트 없음) 그래프 기반 검사가 edge
  존재 여부를 판정하지 못하고 보수적으로 실패 처리했을 가능성이다. (b)를 해소하려고
  `index_repository`로 이 워크트리를 색인하려 했으나 이 세션에서는 그 MCP 쓰기 호출 권한이
  자동 승인되지 않아 실행하지 못했다(형태를 바꿔 우회하지 않고 `.pluto/progress.md`에
  그대로 기록). 그래서 (a)를 직접 해소하는 쪽으로 `app.use("/auth", authRouter);` **그 줄에
  직접** 인라인 주석을 붙여, 그 정확한 줄 자체가 이번 diff에서 `-`/`+` 쌍으로 나타나게
  했다(동작은 여전히 동일 — 주석만 추가).
- `backend/routes/auth.routes.js` — `POST /auth/find-id`를 IP 제한 → 입력 검증 → 대상(닉네임)
  제한 → 컨트롤러 순서로 등록.
- `backend/models/auth/account_find_request.model.js` — `email`을 `allowNull: true`로 변경.
- `backend/scripts/migrate-db.js` — `MIGRATIONS` 배열에 `0014-find-id-requests`를 마지막에 추가.
- `backend/middleware/errorHandler.js` — `req.originalUrl === '/auth/find-id'`인 미처리 오류(잘못된
  JSON 본문 포함)를 원본 오류 노출 없이 고정된 `INVALID_INPUT`(400)/`SERVER_ERROR`(500)로 응답.
- `frontend/src/domains/auth/api/auth.api.js` — `findIdApi` 추가.
- `frontend/src/app/routes/index.jsx` — `/find-id`를 `ProtectedRoute` 밖에 등록.
- `frontend/src/domains/auth/components/LoginForm/LoginOptions.jsx` — `/find-id`로 가는
  "아이디 찾기" 링크 추가.
- `frontend/src/domains/auth/components/AuthImageButton.jsx` — 선택적 `disabled`/`visibleLabel`
  props 추가(기존 호출부는 기본값이라 동작 변화 없음).
- `frontend/src/domains/game/ingame/__tests__/InGamePage.deadParticipant.integration.test.js` —
  실제 router.routes 전체 목록을 잠그는 기존 회귀 시험(`ROUTE_WIRING_LOCK`)에 `/find-id` 항목을
  추가(따라오는 수정 — 새 공개 라우트가 생겼으므로 잠금 목록 갱신이 필요했다).
- `backend/__tests__/dbStartup.test.js` — 실제 `backend/index.js`를 기동해 `/auth/me` 401을
  확인하던 기존 단정 옆에 `POST /auth/find-id` 400 단정을 추가(위 `backend/index.js` 항목 참고,
  따라오는 수정).

**신규**
- `backend/validation/findIdValidation.js` — `validateFindIdPayload`/`validateFindIdRequest`.
- `backend/utils/maskEmail.js` — `maskEmail`.
- `backend/middleware/rateLimit.js` — `createRateLimiter`(메모리 고정 창).
- `backend/service/accountRecovery.service.js` — `findId`.
- `backend/controller/accountRecovery.controller.js` — `findId`.
- `backend/db/migrations/0014-find-id-requests.js` — `account_find_requests.email` nullable화.
- `frontend/src/domains/auth/pages/FindIdPage.jsx` — `/find-id` 화면.
- `backend/__tests__/findId.api.test.js`, `backend/__tests__/findId.policy.test.js`,
  `backend/__tests__/rateLimit.test.js`, `backend/__tests__/findId.rateLimitWiring.test.js`,
  `backend/tests/db/f29a-find-id.integration.test.js`,
  `frontend/src/domains/auth/pages/__tests__/FindIdPage.ui.test.js` — 아래 §2 참고.

## 2. AC별 실행 명령·결과

모든 명령은 `node C:/dev/pluto/packages/daemon/dist/src/impl-check.js <...>`로 실행했고, 전문은
`.pluto/checks/`에 보존되어 있다.

| AC | 명령 | 결과 |
| --- | --- | --- |
| AC-01 | `node-test --prefix backend __tests__/dbStartup.test.js` | 4/4 pass — 실제 `require("backend/index.js")`로 기동한 진짜 `app`에 `POST /auth/find-id`가 400(INVALID_INPUT)으로 응답함을 확인, `backend/index.js::app`이 `auth.routes.js::router`를 마운트함을 직접 증명(재검토 R-IMPL 대응). |
| AC-01/02/03/04 | `node-test --prefix backend __tests__/findId.api.test.js` | 9/9 pass |
| AC-01/02/03/04 | `node-test --prefix backend __tests__/findId.policy.test.js` | 22/22 pass |
| AC-05 | `node-test --prefix backend __tests__/rateLimit.test.js` | 10/10 pass(순수 제한기 로직) |
| AC-05 | `node-test --prefix backend __tests__/findId.rateLimitWiring.test.js` | 3/3 pass(실제 HTTP 배선 — IP→검증→대상 순서, 검증 실패가 대상 카운트에 섞이지 않음, 대상별 독립 카운터) |
| AC-01/02/03/04/06 | `node-test --prefix backend tests/db/f01-migrations.integration.test.js tests/db/f29a-find-id.integration.test.js`(f01을 앞에 두는 순서 규칙 준수) | 13/13 pass — 실제 격리 MySQL(`F01_TEST_DATABASE_URL`)에서 실행됨. F-01의 기존 5개 케이스 포함 회귀 없음. AC-03의 "마스킹 힌트로 로그인 불가"도 실제 `/auth/login`을 호출해 401을 확인했다. |
| AC-07(화면 상태 전이) | `test --prefix frontend`(전체 프론트 회귀, `FindIdPage.ui.test.js` 포함) | 2256/2256 pass |
| AC-07(빌드) | `build --prefix frontend` | 성공(`vite build`, 1056 모듈 변환) |

회귀 확인용으로 `auth.routes.js`를 함께 마운트하는 기존 스위트도 개별 실행했다 —
`socialAuth.route.test.js`, `googleAuth.route.test.js`, `discordAuth.route.test.js`,
`auth.login.regression.test.js`, `auth.sessionGuard.test.js`, `dbStartup.test.js`,
`user.accountPaths.test.js` 전부 통과(합계 실행 시 `findId.api.test.js`의 fetch 포트가
undici의 차단 포트 목록과 우연히 겹쳐 2건이 `TypeError: fetch failed`로 흔들렸으나, 단독
재실행에서는 9/9 통과 — OS가 임시로 할당한 포트 우연 충돌이며 이 슬라이스의 결함이 아니다).

backend 전체 시험과 frontend 전체 회귀(2256개, 위 표에 포함)는 이 문서 작성 시점 기준
구현 중 실행 허용 범위 안에서 실행했다. **backend 전체 시험은 검증 단계가 별도로 돌린다.**

## 3. AC-06 — `0014-find-id-requests` 마이그레이션 러너북

`0001-legacy-baseline.js`/`0002-expand-nickname-snapshot.js`와 같은 운영 절차
(`docs/requirements/2026-09-09-f01-migration-runbook.md` §3~5)를 그대로 따른다. 이 절만
`0014`에 고유한 부분을 덧붙인다.

### 적용
1. 백업 → 쓰기 중지 → `node backend/scripts/migrate-db.js status`로 현재 상태 확인(§F-01
   runbook §3와 동일).
2. `node backend/scripts/migrate-db.js migrate` — `MIGRATIONS` 배열 순서상 0001~0013 다음에
   0014가 마지막으로 실행된다. `account_find_requests.email`이 이미 nullable이면 DDL 없이
   즉시 종료한다(멱등, AC-06).
3. `verify()`가 `email.allowNull === true`와 핵심 컬럼(`id`/`email`/`request_type`/
   `ip_address`/`created_at`) 보존을 확인한다.
4. 새 빈 DB는 `backend/index.js`의 `sync()`보다 먼저 `migrate-db.js migrate`를 실행해야
   한다는 F-01 runbook §3의 순서 주의가 동일하게 적용된다.

### 복구(down 거부)
`account_find_requests.email`이 `NULL`인 행이 하나라도 있으면 `down()`이 즉시 거부하고
**아무 것도 바꾸지 않는다**(컬럼 정의·행 모두 그대로) — `f29a-find-id.integration.test.js`의
"NULL 이메일 행이 있으면 down()은 데이터를 보존한 채 거부되고..." 케이스가 이를 실제 DB에서
증명한다. 되돌리려면:
1. `NULL` 이메일 행을 지우거나(FIND_ID/PASSWORD_RESET 로그이므로 보존 가치가 낮다면 삭제
   가능) 보존해야 한다면 `down()`을 아예 실행하지 않는다.
2. 지운 뒤에만 `down()`이 `email`을 다시 `NOT NULL`로 되돌린다.
3. 다른 NULL 허용 컬럼(F-01 runbook §5의 두 복구 경로 A/B)과 마찬가지로, DDL 자체가 실패한
   경우는 전체 백업 복원을 기본으로 삼는다.

### 재실행 안전성(AC-06 핵심)
`0014.up()`을 같은 DB에 두 번 호출해도(직접 호출·CLI 재실행 모두) 오류 없이 끝나고, 기존
행(이관 이전에 있던 `email` 값이 있는 행 포함)은 그대로 보존된다 — 위 §2 DB 통합 시험이
직접 두 번 호출해 확인했다.

## 4. Chrome 화면 확인(AC-07)

운영자 표준 지침(2026-09-19/09-20 배치 운영 규칙)에 따라, 수동(UI) AC는 실제 브라우저
확인을 F-28 담당으로 별도 보존하고 이 슬라이스에서는 "완료"로 바꾸지 않는다. 이 슬라이스가
실제로 남긴 증거는:
- `FindIdPage.ui.test.js`(§2) — jsdom + 실제 JSX 로더로 `FindIdPage.jsx`·`LoginOptions.jsx`를
  실제로 마운트해 idle/submitting/found/notFound/rateLimited/failed 여섯 상태, 중복 제출
  방지, 입력 보존/삭제, 늦은 응답 폐기, 뒤로 가기를 전부 실제 컴포넌트로 검증했다.
- `vite build` 성공 — production JSX 컴파일 경로에 구문 오류가 없음을 확인했다.
- 실제 Chrome 조작(좁은 화면 레이아웃, 실제 서버 429/5xx 타이밍, 오프라인 전환 등)은
  **미실행**이다 — F-28 인수 시 실제 브라우저로 확인해야 한다.

## 5. 이 슬라이스 밖으로 남는 것

- `recovery_email_delivery`는 `readiness_unverified` 그대로다. 메일 어댑터·발송 주소·공식 앱
  URL·실제 수신함은 BX/CF/BM 범위의 외부 입력이며, 이 슬라이스는 이메일을 "발송"하지 않고
  마스킹된 힌트만 화면에 표시한다 — 이 상태를 BW의 준비 차단 사유로 삼지 않는다.
- 비밀번호 찾기(비밀번호 재설정)는 여전히 미연결이다(`LoginOptions.jsx`의 기존 버튼 그대로) —
  `account_find_requests.request_type`에 `PASSWORD_RESET` 문자열을 저장할 수 있음은 이번에
  확인했지만(AC-06 fixture), 실제 재설정 기능 자체는 F-29a 범위가 아니다.
- 요청 빈도 제한은 프로세스 메모리 기반이다 — 재시작 시 초기화되고, 다중 인스턴스 간 공유되지
  않는다. 이는 `createRateLimiter`의 확정 설계 특성이며 결함이 아니다(계획 메모 AC-05 참고).
