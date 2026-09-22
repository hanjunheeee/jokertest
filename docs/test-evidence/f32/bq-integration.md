# F-32 BQ 통합 인수 기록과 F28 인계

- 대상: 브랜치 `pluto/BQ` 작업본(기준 커밋 `0517d069` 위의 BQ 구현 변경).
- 작성: BQ 구현 회차(2026-09-22). 이 문서는 **구현자가 실제로 실행한 것**과 **실행하지 않은 것**을 나눠 적는다. 실행하지 않은 항목에는 PASS를 적지 않는다. 독립 코드 심사·검증 단계의 재실행 결과는 이 문서가 대신하지 않는다.
- 설계 근거: `docs/design/F-32-diamond-topup-gold-purchase.md` §2-6·§2-6a.

## 1. 무엇을 바꿨나

| 구분 | 위치 | 내용 |
|---|---|---|
| 서버 | `backend/service/topup.service.js` `listOpenTopupOrders` | 인증 계정의 `CONFIRMING`·`PENDING_GRANT` 주문만 `created_at` 내림차순 최대 5건, 공개 필드 5개. 읽기 전용(상태 변경·지급·결제 어댑터 호출 없음) |
| 서버 | `backend/routes/economy.routes.js` `GET /economy/topup/orders?state=open` | `verifyToken`·`requireSelf`, `state`가 문자열 `open`이 아니면 400 `INVALID_TOPUP_ORDER_REQUEST`, 성공 응답도 `Cache-Control: no-store`, 오류는 기존 충전 범위 처리기(`errorHandler.js`, 수정 없음) |
| 화면 | `frontend/src/domains/store/store/currencyPurchase.store.js` | `discoverOpenOrders`(진입 식별자당 1회), 주문별 확인 기록(자동 5회 예산·진행 중 조회 공유·선점 중 도착한 결과 보관), 복귀 우선·대기열 순차 처리, `refreshSummary`가 지갑과 원장을 함께 재조회 |
| 화면 | `frontend/src/domains/store/store/currencyHistory.store.js`(신규) | 본인 `transactions` 조회·검증·계정 세대/요청 순번 격리 |
| 화면 | `frontend/src/domains/store/components/panel/CurrencyTransactionHistory.jsx`(신규) | 불러오는 중·오류(재시도)·빈 내역·최근 50건 목록 |
| 화면 | `frontend/src/domains/store/components/panel/StorePanel.jsx` | 진입 식별자, 복귀 처리 → 발견 순서, 일반 진입의 원장 조회, 내역 컴포넌트 마운트(재화 탭) |
| 화면 | `frontend/src/domains/store/store/storePurchase.store.js` | 골드 결과 반영 뒤 현재 지갑·원장 재조회(결과 조회의 잔액은 최초 구매 스냅샷이므로) |

마이그레이션·모델·운영 상품 시드는 바꾸지 않았다. F32a·F32b·F32c의 서버 계약(주문 생성·confirm·단건 조회·골드 구매·결과 조회)은 재구현하지 않고 그대로 호출한다.

## 2. 실제로 실행한 검증(구현자)

실행기: `node C:/dev/pluto/packages/daemon/dist/src/impl-check.js …` — 로그 전문은 작업본 `.pluto/checks/`에 남는다.

| 명령 | 종료 코드 | 집계 | 로그 |
|---|---|---|---|
| `node-test --prefix backend tests/db/f01-migrations.integration.test.js tests/db/f32a-topup.integration.test.js` | 0 | 33 통과 · 0 실패 · 0 건너뜀 | `.pluto/checks/1790028377948-41792-node-test.log` |
| `node-test --prefix backend tests/db/f01-migrations.integration.test.js tests/db/f32b-gold-purchases.integration.test.js` | 0 | 21 통과 · 0 실패 · 0 건너뜀 | `.pluto/checks/1790029203793-22108-node-test.log` |
| `node-test --prefix backend __tests__/topup.security.test.js __tests__/topup.errorHandler.test.js __tests__/topup.route.test.js` | 0 | 82 통과 | `.pluto/checks/1790029185947-38968-node-test.log` |
| `test --prefix frontend`(프런트 전체) | 0 | 2448 통과 · 0 실패 · 7 건너뜀(기존 DB 의존 화면 시험, BQ와 무관) | `.pluto/checks/1790029423005-22472-test.log` |
| `build --prefix frontend`(vite production build) | 0 | — | `.pluto/checks/1790029469365-10460-build.log` |

backend **전체** 시험과 `tests/db` 전체 직렬 실행은 검증 단계가 돌린다 — 이 문서 작성 시점에 구현자는 돌리지 않았다(미실행, PASS 아님).

### 2-1. 시험 경계(무엇이 진짜이고 무엇이 대역인가)

| 시험 | 진짜 | 대역 |
|---|---|---|
| `f32a-topup.integration.test.js`의 BQ 3건 | Express 경제 라우트·서비스·모델, MySQL 격리 DB, 앱과 별도 Sequelize 연결로의 대조 | 인증 저장소(세션·차단 조회), 결제 어댑터(`fakeTossAdapter`) |
| `F32CurrencyPurchase.ui.test.js`의 BQ 13건 | 실제 router·ProtectedRoute·StorePage·StorePanel·스토어·API 클라이언트(JSDOM) | 서버 HTTP(`fetch`), 토스 SDK, 타이머 |
| 실제 서버 + Chrome | — | **미실행**(3절) |
| 실제 토스 테스트 결제창 | — | **미실행**(4절) |

JSDOM의 재마운트·`setUser`는 실제 브라우저 새로고침·서버 로그인 증거가 아니다.

## 3. AC별 사건 순서와 증거

### AC-01 다이아 충전 후 새로고침·재로그인 복원
- 서버(f32a `BQ 통합`): 승인 응답 유실로 `CONFIRMING`(원장 0) + 지급 쓰기 실패 주입으로 `PENDING_GRANT`(원장 0) → 발견 `GET ?state=open`이 최신순 `[PENDING_GRANT, CONFIRMING]`, 결제 어댑터 호출·잔액 불변 → 발견된 orderId로 기존 단건 GET → 둘 다 `GRANTED` → 중복 GET·confirm 동시 호출 뒤에도 주문별 충전 원장 1행, 다이아 220(=110×2), 발견 목록 빈 배열.
- 화면(UI `복귀 URL·저장소 없이 진입…`): 저장소에 충전 주문 없음·복귀 URL 없음 → 발견 1회 → 최신 주문 한 건 표시 → 1999ms 조회 0회, 2000ms 1회 → `GRANTED` → 잔액 DOM 110 → 다음 주문 별도 예산 → 220 → 원장 행 id·사유·통화·증감·거래 후 잔액 대조. confirm 0회.
- 복귀 우선·단일 표시·5회 예산·늦은 응답: UI BQ 시험 `앞 주문이 미확정·상한이면…`, `복귀 URL과 같은 orderId…`, `발견 주문 조회 중 다른 주문의 성공 복귀…`, `선점된 발견 주문의 늦은 조회가 GRANTED…`, `같은 주문의 발견 조회가 진행 중일 때…`, `발견 실패·깨진 응답…`, `StrictMode…`, `A→B→A…`, `계정 전환 뒤 이전 계정 발견 주문…`.
- 원장 표시: UI `거래 내역은 서버 원장 순서·값을 그대로…`(BIGINT 문자열 id 보존, 실패·깨진 응답은 오류+재시도, 성공한 빈 배열만 '없음'), `충전 완료 뒤 지갑·원장 조회가 실패해도…`.

### AC-02 골드 구매 후 양쪽 잔액·구매 원장
- 서버(f32a `BQ 통합`): D220/G0에서 임시 상품 D30→G100+10 → `{balanceGold:110, balanceDiamond:190}`, 같은 키 재요청은 최초 결과, wallet·transactions 응답을 별도 연결의 지갑·원장 행과 필드별 대조, 골드 원장 2행·구매 요청 1행. 이후 다른 충전으로 지갑 D300이 되어도 `GET /economy/purchases/:ref`는 최초 110/190, wallet은 110/300.
- 화면: UI `골드 결과 조회의 잔액은 최초 구매 스냅샷…`(결과 조회 뒤 현재 wallet 1500/50 표시, 원장 2행, confirmed·원래 참조 ID 유지, 재조회 실패가 완료를 뒤집지 않음), 기존 `늦은 지갑 조회` 시험을 구매 전/후 응답 분리 보류로 강화.
- 기존 f32b 21건(두 번째 원장·구매 요청 저장 실패 롤백, 응답 유실 뒤 최초 결과, 동시·중복 요청)은 수정 없이 통과.

### AC-03 변조·타인·부족·취소·실패·불명·DB 장애·중복
- f32a 기존 시험(금액 변조, 타인 주문, 실패·취소·만료, 승인 불명, 지급 쓰기 실패, 동시 confirm·GET, 결제키 충돌, 임대 상실, 스냅샷, 마이그레이션 보존)을 삭제·약화 없이 유지하고 통과.
- BQ 추가: 발견의 비인증 401, `state` 누락·빈 값·대소문자·다른 값·중복·배열 400, 쿼리 `userId` 위조 무시, DB 조회 실패 500 `SERVER_ERROR`(내부 원문 비노출), 모든 응답 `no-store`, 두 계정·7개 상태 혼합에서 자기 계정 최신 5건·허용 키 5개·다른 계정 0건, 발견 전후 주문·지갑·원장 행과 어댑터 호출 수 불변, 최신 5건 종결 뒤 다음 조회에 남은 2건.
- 타인의 transactions·wallet 403.

### AC-04 기존 산출물 재사용·전체 시험·빌드
- 기존 F32c UI 시험의 단언은 유지했다. 바꾼 것은 픽스처뿐이다: 골드 성공 응답이 서버 커밋값을 `world`에 반영(`goldCommitted`)해 구매 뒤 재조회한 wallet도 같은 값을 돌려주고, 구매 직후 잔액 단언은 재조회 완료를 기다리도록(`waitBalance`) 바뀌었다. `newWorld`는 빈 발견·빈 원장을 기본으로 둔다.
- 프런트 전체·빌드는 2절 표.

### AC-05 승인된 격리 DB만 사용
- DB 시험은 pluto 실행기가 주입한 격리 테스트 DB 연결로만 돌렸다(접속 정보는 로그에 남지 않는다). f32a·f32b의 `setUp`은 `isolatedTestDb.resetManagedSchema/resetManagedData`를 거치며, 이 도우미가 URL 이름과 `SELECT DATABASE()`가 `pluto_f01_20260909_al`·`pluto_f01_20260909_al_restore_check` 중 같은 이름인지, 관리 목록 밖 테이블이 없는지 확인한 뒤에만 정리한다(도우미는 수정하지 않았다). 두 실행 모두 이 검사에서 거부되지 않았다.
- **미수행**: 구현자는 시험 전 대상 DB의 기존 데이터 백업·복원 대조를 따로 하지 않았다(실행기가 준 격리 DB를 그대로 사용). 운영 DB·볼륨에는 접속·초기화하지 않았다. 보존 데이터 대조가 필요하면 검증·F28 단계에서 수행한다.

### AC-06 실제 토스 테스트 결제 — 미완료·미검증, F28 인계
- 실제 키를 읽거나 출력하지 않았고, 유효한 테스트 키 세트가 있다고 가정하지 않았다. 실제 토스 결제창·승인 API 호출은 **하지 않았다**.
- 키가 없을 때의 동작은 기존 시험이 대역으로 확인한다: 주문 생성 `CONFIG_MISSING` → 설정 대기·SDK 0회·confirm 0회(F32c UI), 실제 어댑터의 키 누락·live 키 거부(f32a AC-05). clientKey만 있고 secret이 없으면 주문 생성은 되고 confirm이 설정 오류가 될 수 있으므로 "키 미준비 = 주문 생성 실패"로 단정하지 않는다.

## 4. 미수행 항목과 재개 입력(F28 인계)

| 항목 | 상태 | 담당 | 재개 입력 |
|---|---|---|---|
| 실제 토스 **테스트** 결제창 → 서버 승인 → 다이아 증가 → 골드 구매 → 양쪽 잔액·원장 → 새로고침·재로그인 | 미완료·미검증 | 사용자/운영자 | 토스 테스트 clientKey·secretKey 세트, 테스트 결제 계정·환경. 서버 환경 설정에만 둔다 |
| 실제 서버 + Chrome: 로그인 → 상점 → 지급 장애로 만든 진행 주문 복구 → 새로고침 → 로그아웃·재로그인, 별도 프로필의 `/store` 직접 진입에서 URL·저장소 없이 발견·완료·원장 확인 | 미실행 | F28 최종 통합 인수 | 격리 DB에 연결한 실제 서버, 시험 계정(사용자가 준비), 지급 장애 주입 방법(별도 연결로 `PENDING_GRANT` 주문 준비). 장애 주입 복구와 실제 결제는 증거에서 구분한다 |
| Chrome: 골드 구매 → 새로고침 → 재로그인 → 별도 프로필에서 양쪽 잔액·골드 원장 2행을 서버 값과 대조 | 미실행 | F28 | 위와 같음 |
| Chrome: 원장 스크롤·오류 재시도·좁은 화면·확대 글자·기존 스킨·일괄 구매 회귀, 별도 연결의 상품 등록·변경·중지가 재시작 없이 반영 | 미실행 | F28 | 위와 같음 |
| 격리 DB 기존 데이터 백업·복원 대조 | 미실행(구현자) | 검증/F28 | 대상 DB 이름 확인 후 덤프·복원 절차 |
| 외부 상품 등록 서버와의 실제 통합 | 범위 밖·미검증 | 운영자 | 해당 서버 연결 준비 |
| backend 전체 시험·`tests/db` 전체 직렬 실행 | 구현자 미실행 | 검증 단계 | — |

최종 운영 가격은 착수 차단 사유가 아니며, 이 문서의 수치(1000원→100+10 다이아, 30 다이아→100+10 골드, UI 시험의 1100원 등)는 시험 전용 임시값이다.
