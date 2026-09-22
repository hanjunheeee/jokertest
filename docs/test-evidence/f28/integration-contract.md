# F-28 통합 인수 계약 · 증거 대응표

- 슬라이스: BN (F-28 통합 인수·회귀 검증)
- 기준 HEAD(작업 시작): `f8036271b13e50e5c5d971eca8d2bf521646066a` — 후보 SHA는 최종 보고서(`final-acceptance.md`) 첫 절에 기록한다.
- 성격: 최종 보고서의 부속 근거. 각 완료 조건을 **생산 입력 → 저장 또는 사건 → 수신 → 최종 소비처**와 기존 시험에 대응시키고, 시험의 시작 상태·실패 주입·중간/최종 기대값·대역 경계를 적는다. 런타임 호출·DB 변경은 없다.
- 판정 표기: `PASS`(이번 후보에서 실제 실행되어 통과) · `FAIL` · `skip`(실행기가 건너뜀 — 통과 아님) · `미실행`(이번 BN 구현 단계에서 돌리지 않음) · `운영자`(실제 Chrome·외부 연동·청음 필요 — 자동 근거로 대신하지 않음).
- 이 문서의 자동 근거는 **대역 경계 안의 증거**다. 메모리 메일 어댑터, 로컬 OAuth fixture, 가짜 결제 어댑터, jsdom 매체 대역의 성공은 실제 메일 수신·실제 제공자 로그인·실제 토스 결제·실제 청음이 아니다(A-03).

## 0. 승인 완료 조건 원문 (AC-01~06, 수정된 AC-05 포함)

| ID | 종류 | 원문 |
|---|---|---|
| AC-01 | test | npm test --prefix frontend, npm run build --prefix frontend, npm run test:game-core --prefix backend, npm test --prefix backend가 모두 실행되어 결과가 기록된다. |
| AC-02 | manual | 격리 DB(pluto_f01_20260909_al, pluto_f01_20260909_al_restore_check)만을 사용해 인증·경제·전적·업적 회귀가 검증되고 사용자 DB는 비우지 않는다. |
| AC-03 | test | 개별 구매 실패 시 해당 거래만 무차감되고 일괄 구매 한 품목 실패 시 묶음 전체가 무차감됨이 별도로 확인된다. |
| AC-04 | manual | 관전자 입장 기능은 전면 제거된 상태에서 사망 참가자의 결과 수신·관전/나가기 선택 유지가 확인된다. |
| AC-05 | manual | F-01~F-27, F-29, F-30~F-32까지 31개 기능(F-28 자신 제외; F-22는 강제종료 취소 상태 — docs/requirements/2026-09-18-remove-host-force-end.md — 로 버튼 재등장 없음을 확인)의 정상 병합 상태와 통합 인수 결과가 확인된 후 최종 보고가 작성된다. |
| AC-06 | manual | 외부 메일·결제·청음 등 실제로 수행하지 못한 검증 항목이 미검증 사유와 함께 기록된다. |

추가 이관 조건(선행 슬라이스가 F-28로 넘긴 것): `SFX-INTEGRATION-28`(F-16 기존 사건 + F-17 알림·F-19 초대·F-27 영상의 소리 연결), `RESTORE-INTEGRATION-28`(F-24 다음 방 설정 복원의 실제 순차 게임 흐름). 원래 완료 조건은 `docs/requirements/2026-09-22-f28-manual-checklist.md` 1~3절.

## 1. AC-01 — 공식 명령 실행 계약

연결: 후보 SHA · 등록 명령 → 실행 로그와 종료 코드 → 시험별 결과(pass/fail/skip 수) → 최종 보고서의 자동 판정.

| 순서 | 명령(공식 verifyCommands 순) | 실행 주체 | 비고 |
|---|---|---|---|
| 1 | `npm ci --prefix frontend` | BN 구현 단계 + 검증 단계 | 작업본에 node_modules 없음 → 설치 필요 |
| 2 | `npm ci --prefix backend` | BN 구현 단계 + 검증 단계 | bcrypt install script 미승인 경고(prebuild 사용) |
| 3 | `npm test --prefix frontend` | BN 구현 단계(impl-check 실행기) + 검증 단계 | |
| 4 | `npm run build --prefix frontend` | BN 구현 단계(impl-check 실행기) + 검증 단계 | |
| 5 | `node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test` | **검증 단계**(BN 재시도의 구현 단계 호출은 도구 승인 대기로 실행되지 못함 — 결과 행은 `final-acceptance.md` 2절 7번) | backend 전체(`npm test --prefix backend` = `node --env-file=.env.test --test`)의 승인 실행기 대응. 실행기는 package `scripts.test` 대조, `F01_TEST_DATABASE_URL` 주입, `--test-concurrency=1`, fetch-no-keepalive 사전 적재, TAP·로그 기록. verifyTimeoutMs=1800000, 실행기 timeout=2400000(임의로 늘리지 않음). raw `npm test --prefix backend`는 기본 `/test` DB 설정이라 따로 돌리지 않는다. |
| 별도 | `npm run test:game-core --prefix backend` | BN 구현 단계 | 원래 AC-01 문구 대응. `game-core/__tests__/*.test.js` 9개 파일을 실행기로 같은 집합 실행 |

판정 규칙: 종료 코드 0이라도 **필수 DB 시험의 skip·시간 초과는 PASS가 아니다**. frontend 시험의 skip 7건(`F29Recovery.integration.test.js`, `F01_TEST_DATABASE_URL` 미주입)은 skip으로 따로 적는다.

진행 순서: 문서·필요 회귀 작성 → 관련 회귀 → Claude/Codex 독립 심사 → 공식 전체 시험·빌드·보호 DB → 운영자 Chrome 단계의 미검증 기록 → 정상 승인·병합. 반려 보수 뒤에는 심사부터 다시 한다.

wiring: 새 hook·사건·소비처 없음 → 비어 있음.

## 2. AC-02 — 격리 DB 경계와 인증·경제·전적·업적 회귀

### 2.1 DB 경계 (X0220 `backend/tests/helpers/isolatedTestDb.js`)
연결: 승인 DB 설정(`F01_TEST_DATABASE_URL`) → 실행기의 이름 검사 → 시험의 실제 연결 → `ALLOWED_DATABASE_NAMES`(두 승인 이름) 대조·`SELECT DATABASE()` 실측 대조(`assertDedicatedTestDatabase`) → 미등록 테이블 검사 → `resetManagedSchema`/`resetManagedData` 초기화 → 기존 DB 회귀 → 보고서의 DB 결과.

- 불일치하면 초기화 **전에** 예외를 던진다. reset 함수 자체에는 백업 기능이 없다.
- 보존·복구 근거는 별도: `backend/tests/db/f01-migrations.integration.test.js`(X0196)의 백업·복구·행 비교(`_restore_check` 격리 DB). 사용자 DB·Docker 볼륨은 어떤 시험도 건드리지 않는다.
- 동시 쓰기 금지: 같은 승인 DB에 시험과 앱/QA가 동시에 쓰지 않는다. DB 시험은 f01을 같은 명령의 맨 앞에 두고 직렬 실행한다.

### 2.2 인증
| 흐름 | 생산 입력 → 저장/사건 → 소비처 | 기존 시험 | 시작 상태 · 실패 주입 · 기대값 |
|---|---|---|---|
| 가입 이메일 증명 → 계정·기본 지급 | 가입 화면 발송·확인 → `auth.routes.js`(X0139) `/signup/email-code`·verify 제한기·검증 미들웨어 → signup_email_verifications → 가입 트랜잭션 | `SignupEmailVerification.ui.test.js`(X0281), `SocialSignupEmailVerification.ui.test.js`(X0282), `f31-social-email.integration.test.js`(X0214) | 동시 완료 → 계정·identity·기본 지급 정확히 1회; 기본 지급 도중 실패 주입 → intent·증명·사용자·identity·경제·세션 전부 롤백 후 같은 자격 재시도 성공; 로컬·소셜 동시 소비 → 한쪽만 성공(패자 SIGNUP_PROOF_INVALID); 기존 Google identity 재로그인 추가 인증 없음 |
| 비밀번호 재설정 | 요청 → 토큰 발급 → GET verify(무변경) → confirm → 새 비밀번호 성공·옛 비밀번호/세션 거부 | `f29b-password-reset.integration.test.js`(X0213) | GET을 여러 번 열어도 토큰·비밀번호·세션 불변; 동시 confirm 1회만 성공; 세션 폐기까지 저장 뒤 오류 주입 → 토큰·비밀번호·세션 모두 롤백, 같은 링크 재시도 성공; 만료·사용됨·재발급 이전 링크 거부 |
| 아이디 찾기 | 닉네임·생년월일 → 마스킹 이메일 | `f29a-find-id.integration.test.js` | 마스킹 이메일만 응답 |

대역 경계: 메일은 메모리 어댑터, OAuth는 로컬 제공자 fixture. **실제 메일 수신·실제 제공자 로그인은 운영자 항목**(6절).

### 2.3 경제·업적
- 경제: 3절(AC-03)과 5.2절 참조.
- 업적 계약: 정의 22개(`achievementDefinitions.js` X0167: 기록 7 + 5직업×10/20/30승 15) → 경기·투표 진행률(`achievementService.loadProgress`, X0171) → 임계값 평가 → 지급·보상·알림(`evaluateAndGrantForUser`) → 조회(`f12-achievements.api.test.js` X0203) → 서고 표시(`frontend/src/domains/library/store/__tests__/achievements.store.test.js`, `.../invitedGuests/__tests__/achievements.integration.test.js`).
- `achievementService.test.js`(X0172)의 임계값 시험은 **공통 지표 시험**이다: 2→3 완료, 9→10 투표, 19→20 생존, 29→30 승리, 시민 9→10승과 직업 격리. 22개 각각의 독립 MySQL 경계 시험이 아니다. 22개 전체 정의·프론트 대응·보상 수량은 `backend/services/achievementDefinitions.test.js`가 보완한다.
- 반복·동시 평가에서 추가 지급 0, 조회는 지급하지 않음(X0203), 시민 30승 소급의 기존 9개 지급·330G·340D 계약, 보상 실패 롤백과 CLI 중단 후 재실행(`f12-achievements.recovery.test.js` X0205, `achievementRecoveryService.evaluateAllUsers` X0169 — 계정별 결과/오류 분리)을 보존한다.
- 격리 DB 통합(`f12-achievements.integration.test.js` X0204): 지급·동시 평가·재평가·중단 경기 제외·과거 기록 소급.

운영자: 기존·신규·소셜 계정의 재로그인·서고·장착 복원을 실제 서버 값과 비교(6절).

wiring: 없음.

## 3. AC-03 — 개별 실패와 일괄 실패의 무차감 (별도 행)

연결: `StorePanel.jsx`(X0895) 개별·일괄 입력 → `storePurchase.store.js`(X0917) `post`/`lookup` → `POST /economy/purchases/bulk` → `economy.service.js`(X0154) `purchaseItems`(계정·요청 ID 기존 결과 확인 → 지갑 잠금 → 품목별 원장·소유권 → 구매 요청 저장, 모두 한 트랜잭션) → `getPurchaseResult` 결과 조회 → 화면 반영.

시험 파일: `backend/tests/db/f09-store-purchases.integration.test.js`(X0202). 두 사건을 한 행으로 합치지 않는다.

| 행 | 시험 이름 | 시작 상태 | 실패 주입 | 최종 기대값 |
|---|---|---|---|---|
| 개별 실패(커밋 전 DB 오류) | `AC-01: 커밋 전 DB 오류(EconomyPurchaseRequest 기록 실패)는 실제 트랜잭션 전체를 롤백한다` | 10000G, 소유권 0 | 첫 `EconomyPurchaseRequest.create` reject | 10000G · 소유권 0 · 원장 증가 0 · 구매 요청 0 |
| 개별 실패는 **해당 거래만** | `AC-01: 기보유 상품 재구매는 거부되고 그 실패 거래 자체는 추가 부작용이 없다` | 이미 성공한 구매 1건 | 같은 상품 재구매 | 앞선 성공 거래는 그대로, 실패 거래의 추가 부작용 0 |
| 개별 실패(검증) | 잔액 부족 / 미판매 / 잘못된 상품 / 참조 사건 ID 누락 (`AC-01:` 4건) | 시험별 | 각 사유 | 차감·소유권·거래 기록 0 |
| 일괄 실패(두 번째 품목) | `AC-02: 두 번째 품목 지급 단계에서 DB 쓰기가 실패하면 첫 번째 품목의 이미 적용된 차감·원장도 함께 롤백된다` | 10000G | 두 번째 `EconomyEntitlement.create` reject(첫 품목은 트랜잭션 안에서 이미 반영) | 10000G · 소유권 0 · 원장 증가 0 · 구매 요청 0 |
| 일괄 실패(검증) | 한 품목 구매 불가 / 총액 초과 / 기보유 품목 혼합 (`AC-02:` 3건) | 시험별 | 각 사유 | 묶음 전체 무차감·무지급·기록 0 |
| 정상 묶음(대조) | `AC-02: 모든 품목이 유효하면 일괄 구매가 한 트랜잭션으로 전부 성공한다` | 10000G | 없음 | 9300G · 소유권 2 · 원장 +2 · 요청 1 |
| 커밋 뒤 응답 유실(개별) | `AC-04: 개별 구매가 커밋된 뒤에는 같은 참조 사건 ID 조회·재시도로 재차감 없이 복원된다` | 10000G | 응답 미소비 가정 → 조회 → 같은 ID 재시도 | 9800G · 구매 원장 +1 · 요청 1 · 재시도 idempotent |
| 커밋 뒤 응답 유실(묶음) | `AC-04: 일괄 구매도 커밋 후에는 조회·재시도로 재차감 없이 복원된다` | 10000G | 같음 | 9300G 유지 · 요청 1 |
| 커밋 전 오류의 조회 | `AC-04: 커밋 전 오류로 끝난 요청은 조회해도 복원되지 않는다` | 잔액 0 | INSUFFICIENT_BALANCE | 조회 결과 null |

프론트 구분: 계정 전환·늦은 주문 응답·지갑/내역 갱신은 `F32CurrencyPurchase.ui.test.js`(X0911) 근거로 따로 둔다. 운영자: Chrome의 개별 실패·묶음 실패·응답 유실 복구와 화면/DB 비교.

wiring: 없음.

## 4. AC-04 — 관전자 입장 제거와 사망 참가자 선택

외부 관전 입장 거부와 사망 참가자의 계속 보기·나가기를 **각각** 기록한다.

### 4.1 외부 관전 입장 거부 (서버)
`backend/socket/__tests__/spectatorAccess.test.js`(X0187) — production 처리기(`gameSession.js` X0190의 `handleGetSessionSnapshot`·`handleLeaveGameSession`)를 시험 전송에 연결한 수신 계약. 실제 네트워크 Chrome 증거가 아니다.
- 시작된 방 코드로 들어오려는 외부 계정 거부, 소속 0.
- 비참가자 `get_session_snapshot`은 공개 상태 0(참가자는 성공).
- 위조로 채널에 가입한 외부 계정의 공개 사건 수신 0(참가자 1).
- `SPLIT-2`: 이탈 커밋 뒤 이탈자 수신 0 · 적격 잔류자 1.
- 늦은 disconnect, 송신 도중 참여 종료, 종료 알림은 cleanupUuids의 적격 잔류자에게만.

프론트 측 제거 잠금: `InGamePage.deadParticipant.integration.test.js`(X0288)의 `F-23(SPLIT-1/AC-02)` 시험들(라우터·socket 사건·마운트 목록에 관전 경로 없음), `roomSettings.integration.test.js`(X0612)의 `F-23(AC-01/AC-02) · 실제 인게임 방관리 탭에 관전자 항목이 없고…`.

### 4.2 사망 참가자 결과 수신·계속 보기/나가기
연결: 서버 밤 판정 사건 → 인게임 store → `InGamePage.jsx`(X0462)가 사망 선택 컴포넌트에 전달 → 계속 보기(요청 0) / 나가기(`leave_game_session` ACK) → 정리·로비 이동.

| 사건 순서 | 시험(X0288) | 기대값 |
|---|---|---|
| 생존 중 | `F-23(AC-06): 생존 중인 참가자에게는 사망 선택이 보이지 않는다` | 선택 없음 |
| 실제 확정 사망 → 두 선택 → 계속 보기 | `F-23(AC-06): 실제 밤 판정 사건으로 확정 사망하면 두 선택이 뜨고, 계속 보기는 서버 요청 0회다` | 요청 0 |
| 나가기 성공 ACK | `F-23(AC-06): 나가기 성공 ACK는 정확히 한 번 정리하고 로비로 replace 이동한다` | 정리 1 · replace 이동 |
| 늦은 ACK | `…언마운트 뒤 도착한 늦은 성공 ACK는…` / `…계정이 바뀐 뒤 도착한 옛 ACK는…` / `…소속 A→B→A 직후…` | 현재 상태 보호 |
| 실패·유실 | `…실패 ACK는 이동 0이고 재시도를 열어 둔다` / `…ACK 유실은 성공이 아니며…` | 이동 0, 권위 확인 뒤 1회 정리 |
| 치료 성공 | `F-25b(AC-02/AC-04): 치료가 성공한 밤…사망 선택이 뜨지 않고…` | 선택 없음 |

운영자: 다중 계정 게임 → 확정 사망 → 계속 보기·결과 수신 → 재접속 → 명시적 나가기 → 이후 수신 차단, 외부 계정 입장 거부(6절).

### 4.3 RESTORE-INTEGRATION-28 (다음 방 설정 복원)
연결: 인게임 유지 체크 → `nextRoomSettingsStore.js`(X0712) `keepSettings`(계정별 정제 저장·재읽기 확인) → 결과 이탈 → `useGameSetupPage.js`(X0706)가 `readRestoreSource`로 폼 초기값 반영 → 생성 요청 → 새 서버 방.

| 계약 | 시험 |
|---|---|
| 실제 시작 방송 → 유지 → 정상 종료 → 결과 이탈 → 다음 생성 폼·요청·새 서버 방: 정원 6·낮 120·투표 30·밤 60·의사 120, 새 방 코드·호스트 1명·준비 해제 | `nextRoomSettings.integration.test.js`(X0711) `F-24(AC-04) · 실제 시작 방송 → …` |
| 유지 해제 뒤 기본값 정원 10·낮 60·투표 60·밤 90 | `F-24(AC-05) · 유지를 끄면 영속 레코드가 사라지고…` |
| 오염 키 제거(저장 매체·폼·생성 요청·서버 설정) | `RESTORE-24 · 실제로 생산한 레코드를 오염시켜도…`, `RESTORE-24 · 허용된 설정 키의 값 안에 숨긴 오염도…` |
| 계정 격리 A 저장 → B 기본 → A 복원 | `RESTORE-24 · 계정 간 복원값이 섞이지 않는다…`, `…키의 계정과 레코드의 계정이 다르면…` |
| 저장·해제 실패 안내(별도 행) | `F-24(AC-05) · 삭제도 비활성 쓰기도 실패하면…`, `RESTORE-24 · 손상된 레코드는 조용히 기본값으로 바뀌지 않고 실패를 알린다` |
| 현재 편집의 정제 경로 | `roomSettings.integration.test.js`(X0612) |

운영자: 승인 DB와 실제 순차 게임에서 같은 흐름(6절). 새 저장 필드·hook·이벤트 없음 → wiring 비어 있음.

## 5. AC-05 — 기능별 병합·통합 인수

### 5.1 수량 계약
- 원래 배치 항목 32개(F-01~F-32).
- F-28 자신을 제외한 점검 행 31개. 그중 F-22 한 행은 **취소**(`docs/requirements/2026-09-18-remove-host-force-end.md`, 커밋 `57f18672`) → 병합 완료로 세지 않는다.
- 선행 정상 병합 대상 30개. F-28까지 포함한 취소 제외 유효 기능 31개.
- 분할 슬라이스(예: F-25a/b, F-27a~d, F-29a~c, F-31a/b, F-32a~c)는 부모 기능 아래에 귀속하고 별도 논리 기능으로 세지 않는다.
- F-22 버튼 재등장 방지: `roomSettings.integration.test.js`(X0612) L528-529 `assert.equal(container.textContent.includes("강제 종료"), false, "취소된 강제 종료가 되살아났다")`를 재사용.
- 병합 원장은 선행 증거의 출처이고, 이번 명령 실행 성공을 대신하지 않는다.

### 5.2 완료 조건별 기존 자동 근거
| 영역 | 기존 시험 |
|---|---|
| 구매 실패·응답 유실 | X0202 `f09-store-purchases.integration.test.js` |
| 업적 | X0172, X0203, X0204, X0205, `achievementDefinitions.test.js` |
| 구매/소유 | X0202, `backend/tests/db/f13-profile-equipment.integration.test.js` |
| 장착 복원 | `frontend/src/domains/user/store/__tests__/skinCardWear.store.test.js` |
| 인게임 최종 표시 | X0289 `accountProfileEquipment.integration.test.js` |
| 친구·초대·차단 | X0209 `f19-friends-invites.integration.test.js`, X0815 `friendInviteRuntime.test.js` (수락 확정은 `gameInvite.service.js` X0158 `finalizeAcceptedEntry`: 수락 시도·계정·차단 재검사, publish 이후 저장 실패는 unpublish로 보상) |
| 효과음 | X0843 `notificationRuntime.test.js`, X0815, `frontend/src/shared/audio/__tests__/sfxPlayer.test.js`, `frontend/src/shared/hooks/__tests__/bgmPlaybackLock.test.js` |
| 밤 영상 | X0291 `nightPresentation.integration.test.js` |
| 아이디 마스킹 | `backend/tests/db/f29a-find-id.integration.test.js` |
| 메일 재설정·토큰·세션 | X0213 |
| 관전자 제거·사망 참가자 | X0187, X0288 |
| 닉네임 8자 | `frontend/src/domains/auth/validation/__tests__/signupValidation.test.js` |
| 이모티콘 구매 거부 | X0202 `AC-05:` 2건, 표시 입력을 소비하는 X0895 `StorePanel.jsx`(`NON_PURCHASABLE_CATEGORIES`) |
| 사용자 UI 영역 보존 | `frontend/src/domains/user/components/MyPageLayout/__tests__/emoticonEntry.test.js` |
| 명예의 전당 진입 제거 | `frontend/src/domains/lobby/__tests__/f18Lobby.test.js` |
| 피의 기록 | X0947 `myPageBloodRecord.test.js` |

### 5.3 경제 통합 (가입 → 다이아 주문 → 승인·지급 → 골드 구매 → 상점 구매 → 장착 → 표시 → 로그아웃·복원)
| 단계 | 소비처 | 시험 · 기대값 |
|---|---|---|
| 상품 등록 → 다음 API 조회 → 가격·지급량·버전 수정 → 재조회 → 판매 중지·삭제 → 신규 주문 거부 | `topup.service.js`(X0165) 상품표 조회 | X0216 `AC-06: 별도 연결의 상품 등록·수정·판매 중지·삭제가 서버 재시작 없이 목록·주문에 반영된다` |
| 주문 스냅샷 보존 | `createTopupOrder`(가격·지급량·보너스·버전 저장) | X0216 `AC-01(A-03): 주문 뒤 … 승인 금액 1000·지급량 110이 유지된다` |
| 승인·지급 복구 | CONFIRMING / PENDING_GRANT | X0216 `AC-03:` 5건(응답 유실·원장 실패·저장 실패·제공자 전 실패·커밋 뒤 유실) → 원장 1회 |
| 다이아 → 골드 | gold purchase 서비스 | X0217 `AC-01:` 정상, `AC-02: 두 번째 원장 쓰기·구매 요청 쓰기가 실패하면 … 전부 롤백` → 초기값, 서버 상품표 값(-30/+110) 반영(`AC-05:`), 재시도·조회 최초 결과(`AC-04:`) |
| 발견·조회·지급 뒤 wallet·transactions 일치 | 발견 API | X0216 `BQ 통합: 발견 → 단건 조회가 CONFIRMING·PENDING_GRANT를 각각 1회 지급하고, 골드 구매 뒤 wallet·transactions·구매 결과가 별도 연결의 DB와 일치한다` |
| 화면: 계정 세대로 늦은 결과 차단, 미완료 주문 발견·조회·폴링 | `currencyPurchase.store.js`(X0915), `storePurchase.store.js` `refreshAfterGold`(X0917), `StorePanel.jsx`(X0895) | X0911 `F32CurrencyPurchase.ui.test.js` |

대역 경계: 결제 제공자는 가짜/로컬 어댑터. 운영자: Chrome 두 창·진행 중 주문 발견·A→B→A(최종 보고서 U-17), 재시작 없는 상품 등록·수정·판매 중지·삭제와 변경 전 주문 조건 보존·가격 재확인(최종 보고서 U-31), 토스 test 키 결제창(U-16·U-18·U-24)(6절).

### 5.4 SFX-INTEGRATION-28
각 사건: 사건 → 생산자 → 수신자·소비 표식 → 자산 또는 무음 사유 → 자동 시험 → 운영자 실제 관측.

| 사건 | 생산자 → 수신·소비 | 자산/무음 사유 | 자동 시험 | 운영자 |
|---|---|---|---|---|
| F-16 기존 사건(버튼·확인/취소·나가기 등) | UI capture → `sfxPlayer.js`(X1005) | manifest 정책 | `sfxPlayer.test.js`, `bgmPlaybackLock.test.js`(금지 BGM 무음 유지) | 청음 |
| F-17 알림 | 서버 `notification_created` → `useNotificationSocketEvents.js`(X0845) `handleNotificationCreated`: 현재 계정 live + sourceKey 최초 소비 → SFX 사건 | 배포 manifest `system-notification`은 **asset-unreviewed** → 매체 생성 0·재생 0 | X0843: `AC-07: 승인 fixture에서 새 시스템 알림의 최초 live만 재생`, `AC-07: 조회·복원·읽음·재접속은 재생 0회다`, `A-07: 실제 배포 manifest에서는 최초 처리도 매체 생성 0·재생 0이고 asset-unreviewed 사유가 남는다` | 자산 검토 후 청음 |
| F-19 초대 | 서버 초대 사건 → `useFriendSocketEvents.js`(X0821) → `gameInvite.store.js`(X0829) `consumeInviteSound`(계정·복원·커서·최신 PENDING·만료·기소비) | 배포 manifest `game-invite` asset-unreviewed → 무음·매체 0 | X0815: `A-07: 배포 manifest의 game-invite는 미검토 무음이고 매체를 만들지 않는다`, 커서·만료·계정 전환·중복 1회, `AC-07: QA 진단은 미검토 자산의 '적격 1 · 청음 0 · asset-unreviewed'를 그대로 적는다`, 수락 ACK 유실 뒤 입장 복구(`AC-06:`) | 자산 검토 후 청음 |
| F-27 밤 성공 영상 | 서버 KILL 대기 → 수신자별 영상(`sfxManifest.js` X1004 관점별 자산) → `InGameNightSuccessPresentation.jsx`(X0296) mix·mute → `useInGameNightSuccessPresentation.js`(X0444) `finish`(수신 범위 비교) → `completeNightSuccess` ACK → 모든 수신자 완료 뒤 다음 역할 | 승인 MOV 파생 영상 **내장음 허용**, `night-success-video`의 별도 SFX는 embedded 정책으로 억제, 금지 BGM 차단 | X0291: `…KILL 영상이 끝나면 서버 완료 기록이 바뀌고…그동안 별도 SFX·매체 생성은 0회다`, `AC-03: 실제 settingsStore의 Master×SFX·음소거 값이 실제 sfxPlayer 계산을 거쳐 video에 반영된다`, 늦은 완료 무효화·재접속·KILL/HEAL·마지막 결과 이동 | Safari·iOS·Chrome canvas 투명 합성·내장음 청음·재시도·건너뛰기 |

주의: `claimAudio`를 현재 영상의 직접 호출 경로라고 쓰지 않는다. 자동 시험은 재생 호출·음소거·볼륨 값만 확인한다.

wiring: 새 런타임 연결 없음 → 비어 있음.

## 6. AC-06 — 미검증 대장으로의 연결

수동 체크리스트 1~3절 → 사유·담당·필요 자료·기대 관측값 → `final-acceptance.md` 4절의 미검증 대장. 다음을 서로 합치지 않는다: 미준비 자산 · 정책상 무음 · 재생 오류 · 브라우저 미실행 · 청음 미수행 · 외부 입력 미제공.

필요 외부 입력: 실제 메일(서비스 계정·발신 주소·앱 URL), 토스 테스트(test client/secret 키), 청음(사람의 실제 관측).

자동 산출물을 끝내도 필수 실제 인수가 남으면 전체 완료·모니터 종료를 선언하지 않는다.
