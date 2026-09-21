# F-32 기능 설계도 — 다이아 충전과 골드 구매

> F-32를 나눈 **모든 조각(CB·CC·CH·BQ)** 의 계획·계획 검증에 같이 붙는다. 조각은 자기 몫만 구현한다.
> 여기 확정된 경로·필드·담당은 **계약**이다 — 조각의 계획은 이것을 바꾸지 않고, 부족한 점은 고치지 말고 `unsure`에 근거와 함께 남긴다.
> 작성 2026-09-20. **운영자 지시(2026-09-19): 가격·지급량·환산율은 일단 임시값으로 만들고 나중에 다시 정한다.** 임시값은 시험 데이터·시드로만 두고 최종 상품표로 확정하지 않는다.
> 상위 계약: `docs/requirements/2026-09-14-f32-db-product-contract.md`(상품은 외부 백엔드가 DB에 등록, 게임 서버는 조회만).

## 1. 이미 있는 것 (소비만 한다 — 계약을 바꾸지 않는다)

| 무엇 | 어디 | 핵심 |
|---|---|---|
| 지갑 | `backend/models/economy/economy.model.js::EconomyWallet` (:25) | `balance_gold`, `balance_diamond` |
| 원장 | `::EconomyLedgerEntry` (:54) — `(user_id, reference_event_id)` unique | `reason, item_id, currency, amount, balance_after` |
| **원장 트랜잭션** | `backend/service/economy.service.js::applyLedgerTransaction` (:190) | 부모 `transaction`을 받는다, 지갑 행 `LOCK.UPDATE`(:223), 중복 `reference_event_id`는 저장된 결과를 돌려준다(:292) |
| 구매 요청·결과 조회 | `::EconomyPurchaseRequest` (:200), `economy.service.js::purchaseItems` (:499), `::getPurchaseResult` (:634), 라우트 `POST /economy/purchases/bulk` (`backend/routes/economy.routes.js:124`), **`GET /economy/purchases/:referenceEventId`** (:153) | 응답 유실은 이 조회로 확정한다 |
| 본인 확인·필드 검사 | `economy.routes.js::requireSelf` (:13), `::rejectUnknownFields` (:73) | 재사용 |
| 코드 카탈로그 | `backend/economy/catalog.js` | 스킨 등. **재화 패키지는 없다 — 여기에 넣지 않는다** |
| 마이그레이션 | `backend/db/migrations/`(경제는 0006·0007·0010·0011, 현재 최고 0013), CLI `backend/scripts/migrate-db.js`에 import 등록 | |
| 화면 | `frontend/src/domains/store/pages/StorePage.jsx`, 잔액 `frontend/src/domains/economy/store/economy.store.js`(`fetchSummary` :259), 구매 컨트롤러 `frontend/src/domains/store/store/purchaseController.js`(referenceEventId 생성·pending/unknown 복구), `storePurchase.store.js` | |
| 자리표시 상품 | `frontend/src/domains/store/constants/storeItems.js:121-147` — `ingame-money-gold-*`, `ingame-money-diamond-*`, `STORE_PRICE_PENDING`, "판매 준비 중입니다." | F-32c가 서버 상품으로 바꾼다 |
| **없는 것** | 결제 제공자 코드·설정 **없음**. 상품·주문·결제 테이블 **없음** | F-32가 만든다 |

## 2. F-32가 확정하는 계약

### 2-1. 상품 테이블 (CB가 만들고 CC가 공유)
- 새 테이블 `economy_currency_products`(새 마이그레이션): `product_id`(안정 ID, PK) · `kind`(`DIAMOND_TOPUP`｜`GOLD_PURCHASE`) · `display_name` · `pay_currency`(`KRW`｜`DIAMOND`) · `pay_amount` · `grant_currency`(`DIAMOND`｜`GOLD`) · `grant_amount` · `bonus_amount`(기본 0) · `status`(`ON_SALE`｜`STOPPED`) · `sort_order` · `version`(수정 때마다 증가) · 시각.
- 허용 조합은 둘뿐: `DIAMOND_TOPUP = KRW→DIAMOND`, `GOLD_PURCHASE = DIAMOND→GOLD`. 금액·수량은 양의 정수. 서버도 읽을 때 유효성을 검사하고 잘못된 행은 목록·주문에서 뺀다.
- **요청할 때마다 DB를 읽는다**(캐시·하드코딩 대체 없음). 외부 작성자가 커밋하면 다음 조회에 반영된다. 외부 등록 서버·관리 화면은 만들지 않는다 — 외부 작성자가 따를 테이블 계약과 등록 예시를 `docs/`에 문서로 남긴다(CB).
- 임시 상품값은 **시험 시드**로만 넣는다(마이그레이션에 운영 상품을 넣지 않는다).

### 2-2. HTTP API (모두 `/economy` 아래, 로그인 필요, `requireSelf`)
| 메서드·경로 | 요청 | 응답 | 담당 |
|---|---|---|---|
| `GET /economy/currency-products?kind=` | — | `{ok:true, products:[{productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, version}]}` — 판매 중·유효한 것만, `sort_order` 순. 없으면 빈 배열. DB 실패는 5xx | CB |
| `POST /economy/topup/orders` | `{productId, version}` | `{ok:true, orderId, amount, orderName, clientKey}` / `PRODUCT_NOT_FOUND`·`PRODUCT_STOPPED`·`PRODUCT_VERSION_MISMATCH`(+현재 상품)·`CONFIG_MISSING`(키 미설정 — 주문을 저장하지 않는다) | CB |
| `POST /economy/topup/orders/:orderId/confirm` | `{paymentKey, amount}` | `{ok:true, status:'GRANTED', balanceDiamond}` / `status:'PENDING_GRANT'`(승인은 됐고 지급 재시도 중) / `AMOUNT_MISMATCH`·`ORDER_NOT_FOUND`·`NOT_OWNER`·`PAYMENT_FAILED`·`CONFIG_MISSING` | CB |
| `GET /economy/topup/orders/:orderId` | — | `{ok:true, status:'CREATED'｜'CONFIRMING'｜'PENDING_GRANT'｜'GRANTED'｜'FAILED'｜'CANCELED'｜'EXPIRED', …}` — 응답 유실 복구용 | CB |
| `POST /economy/gold-purchases` | `{productId, version, referenceEventId}` | `{ok:true, balanceGold, balanceDiamond}` / `INSUFFICIENT_DIAMOND`·`PRODUCT_*` — 같은 `referenceEventId` 재시도는 저장된 결과. 결과 조회는 기존 `GET /economy/purchases/:referenceEventId` | CC |

### 2-3. 충전 주문과 지급 (CB)
- 새 테이블 `economy_topup_orders`: `order_id`(서버 생성, unique) · `user_id` · 상품 **스냅샷**(`product_id, version, pay_amount, grant_amount, bonus_amount`) · `status` · `payment_key`(unique, null 가능) · 시각들. 주문 뒤 상품이 바뀌어도 스냅샷으로 승인 대조·지급한다. 클라이언트가 보낸 금액·지급량은 대조용일 뿐 신뢰하지 않는다.
- confirm 순서: ① 주문 소유권·상태·금액 대조(짧은 트랜잭션에서 `CONFIRMING`으로) → ② **DB 잠금을 잡지 않은 채** 외부 승인 호출 → ③ 트랜잭션: 상태 `GRANTED` + `applyLedgerTransaction`(reason `DIAMOND_TOPUP`, `reference_event_id = 'topup:' + order_id`). ③이 실패하면 `PENDING_GRANT`로 남기고 같은 confirm·조회가 지급을 **이어서** 끝낸다. 어떤 경로로도 한 주문은 한 번만 지급된다(주문 unique + 결제키 unique + 원장 unique).
- 결제창 복귀만으로는 지급하지 않는다. 실패·취소는 미지급. 다른 계정의 주문 접근은 `NOT_OWNER`.
- 결제 어댑터 `backend/payments/tossAdapter.js`: `confirmPayment({paymentKey, orderId, amount}) → {ok, …}`. 구현 둘 — 토스페이먼츠 **테스트** 승인 API 호출(secret은 서버 환경 설정에만, **live 키는 테스트 구성에서 거부**, 키가 없으면 `CONFIG_MISSING`으로 실패하고 지급하지 않는다), 시험용 가짜 어댑터. 실제 테스트 키와 실제 테스트 결제는 외부 입력 — 없으면 **미검증**으로 남긴다.

### 2-4. 골드 구매 (CC)
- 한 트랜잭션: 상품 조회·검증(버전) → 지갑 행 잠금 → 다이아 차감 원장 + 골드 지급 원장(`applyLedgerTransaction`을 부모 트랜잭션으로 두 번, reason `GOLD_PURCHASE`) → `EconomyPurchaseRequest`에 결과 저장 → 커밋. 잔액 부족·중복 클릭·동시 요청·응답 유실에서 부분 성공이나 이중 차감/지급이 없다.
- 원화로 골드를 직접 사는 것, 골드→다이아 역교환, 환불·정기결제는 **범위가 아니다**.

### 2-5. 화면 (CH)
- 상점의 자리표시 재화 상품(`storeItems.js:121-147`)을 서버 상품 목록으로 바꾼다. 빈 목록 안내·조회 실패와 재시도·버전 불일치 시 새 가격 확인.
- 다이아 충전: 주문 생성 → 토스 **테스트** 결제창 호출(클라이언트 키는 주문 응답의 `clientKey`) → 복귀 라우트에서 서버 confirm → 상태 표시(`확인 중`·`지급 대기`·`완료`·`실패`). 완료 뒤 `economy.store.js::fetchSummary`로 잔액 갱신.
- 골드 구매: 기존 `purchaseController.js`의 referenceEventId·pending/unknown 복구 방식을 그대로 쓴다.
- API 함수는 상점 도메인의 기존 API 모듈 관례를 따른다(`storePurchase.store.js` 옆).

### 2-5a. 충전·구매 화면의 상태 전이 (CH)
> **운영자 결정 2026-09-22 (AC-04 '설정 대기'의 판정 입력)**: 화면은 결제 키 유무를 미리 알 수 없다(키는 서버 환경 설정에만 있고, `GET /economy/currency-products`는 상품만 준다). **주문 생성 요청이 키 유무의 판정 입력이다** — `POST /economy/topup/orders`가 `CONFIG_MISSING`(503)으로 거절되면 버튼이 '설정 대기'가 된다. AC-04의 "결제 흐름이 시작되지 않는다"는 **결제창(SDK) 호출 0회 · confirm 0회 · 주문 미저장**을 뜻하며, 주문 생성 요청 1회는 허용된다. 서버 계약은 바꾸지 않고, 프런트 환경변수에 키를 따로 두지 않는다(클라이언트 키는 주문 응답의 `clientKey`만 쓴다).
>
> **파일 편성(같은 날)**: CH는 생산 파일 6개 + 시험 파일 2개(총 8개) 편성을 그대로 허용한다. '파일 3~5개'는 분할할 때의 목안이지 상한이 아니다 — 기능·시험을 빼거나 다시 쪼개지 않는다.

> 아래 표는 2026-09-21 추가 — F-27b(CE) 첫 심사의 생산 코드 결함 2건이 모두 설계도가 한 줄로만 적은 화면 동작(사건 순서·오류 분기)에서 나왔다. 화면은 **상태 × 사건 → 다음 상태·부작용**으로 적는다. 표에 없는 조합은 '상태 유지·부작용 없음'이다. **서버 응답이 계약에 없는 형태(200인데 `ok`가 true가 아님, 알 수 없는 `code` 등)면 성공으로도 특정 실패로도 단정하지 않는다 — 통신 실패와 같은 재시도 가능 상태로 처리하고 입력을 유지한다**(F-29c 첫 심사 지적). 표에 여러 사유가 한 상태로 모이는 경우(예: `INVALID`·`EXPIRED`·`USED` → `linkInvalid`)에도 **사유별로 다른 안내 문구**를 보여 준다.

**다이아 충전**

| 상태 | 사건 | 다음 상태 | 부작용 |
|---|---|---|---|
| `idle` | 상품 선택·충전 누름 | `creatingOrder` | `POST /economy/topup/orders` 1회(`productId`, `version`) |
| `creatingOrder` | 재클릭 | `creatingOrder` | 추가 호출 없음 |
| `creatingOrder` | `ok:true` | `paying` | 토스 **테스트** 결제창 호출(`clientKey`, `orderId`, `amount`는 응답 값만 사용) |
| `creatingOrder` | `PRODUCT_VERSION_MISMATCH` | `priceChanged` | 새 가격 표시 + 다시 확인받기. 자동으로 새 가격에 주문하지 않는다 |
| `creatingOrder` | `PRODUCT_NOT_FOUND`·`PRODUCT_STOPPED` | `idle` | 상품 목록 재조회 + 안내 |
| `creatingOrder` | `CONFIG_MISSING` | `configPending` | 충전 버튼을 **'설정 대기'**로 표시한다. 결제창(SDK) 호출 0회 · confirm 0회. 서버는 주문을 저장하기 전에 거절하므로 주문·결제·지급이 생기지 않는다. 재클릭해도 같은 화면 수명 동안은 주문 요청을 다시 보내지 않는다(상품 목록을 다시 불러오면 풀린다) |
| `creatingOrder` | 네트워크 오류·5xx | `failed` | 재시도 |
| `paying` | 결제창 닫힘·취소·실패 복귀 | `canceled` | **confirm을 부르지 않는다.** 미지급 안내 |
| `paying` | 성공 복귀(`paymentKey`,`orderId`,`amount`) | `confirming` | `POST …/confirm` 1회 |
| `confirming` | `GRANTED` | `done` | `fetchSummary`로 잔액 갱신 |
| `confirming` | `PENDING_GRANT` | `pendingGrant` | "지급 대기" 표시, 주문 조회로 이어서 확인(간격을 두고, 상한 있음) |
| `confirming` | `AMOUNT_MISMATCH`·`NOT_OWNER`·`PAYMENT_FAILED`·`CONFIG_MISSING` | `failed` | 사유별 안내. 미지급 |
| `confirming` | 네트워크 오류·응답 유실 | `unknown` | **성공으로도 실패로도 단정하지 않는다** — `GET …/orders/:orderId`로 확정 |
| `unknown`·`pendingGrant` | 주문 조회 `GRANTED` | `done` | 잔액 갱신 |
| `unknown`·`pendingGrant` | 주문 조회 `FAILED`·`CANCELED`·`EXPIRED` | `failed` | 미지급 안내 |
| 복귀 라우트 | 새로고침(같은 `orderId`) | `confirming` 또는 `unknown` | confirm은 서버가 멱등이므로 다시 불러도 한 번만 지급된다. 화면은 같은 주문에 confirm을 동시에 두 번 보내지 않는다 |

**골드 구매** — 기존 `purchaseController.js`의 상태(pending/unknown/rejected/blocked)와 referenceEventId 복구를 **그대로** 쓴다. 추가되는 것만 적는다.

| 상태 | 사건 | 다음 상태 | 부작용 |
|---|---|---|---|
| `idle` | 구매 누름 | `pending` | `POST /economy/gold-purchases` 1회(`productId`,`version`,`referenceEventId`) |
| `pending` | `INSUFFICIENT_DIAMOND` | `rejected` | 부족 안내 + 충전으로 이동 링크 |
| `pending` | `PRODUCT_VERSION_MISMATCH` | `priceChanged` | 새 조건 확인받기 |
| `pending` | 응답 유실 | `unknown` | 기존 결과 조회(`GET /economy/purchases/:referenceEventId`)로 확정 |
| `pending` | `ok:true` | `done` | 응답의 두 잔액으로 갱신 |

### 2-6. 본 조각 (BQ)
- 새로고침·재로그인·다른 브라우저에서 잔액과 **진행 중이던 충전 주문 상태**가 복원되는 것(주문 조회로 `PENDING_GRANT`를 이어서 끝냄), 로그아웃·계정 전환 시 이전 계정 캐시 초기화.
- F-32 전체 통합 시험과 증거 수집, 조각 사이 어긋난 곳 보완. 실제 토스 테스트 결제는 키가 없으면 미검증으로 남긴다.

> **마이그레이션을 추가하는 조각 공통(2026-09-21 추가, F-29a 실측)**: 새 마이그레이션은 기존 시험의 전제를 깬다 — (1) `backend/__tests__/schema.existingTables.test.js`가 기존 테이블의 컬럼 타입·NOT NULL을 잠그고 있으므로, 기존 테이블을 바꾸면 그 단언을 **지우지 말고 새 스키마로 갱신**한다. (2) `backend/tests/db/`의 마이그레이션 통합 시험 중 '마지막 마이그레이션이 NNNN'이라는 전제에 기대는 것이 있는지 찾아 같이 고친다(F-29a가 f19 시험을 '0013까지 적용한 상태' 기준으로 바꿨다 — 그 방식을 따른다). (3) `backend/scripts/migrate-db.js`에 import 등록. (4) **기존 모델(특히 `users`)에 NOT NULL 컬럼을 더하면**, `backend/tests/db/`의 통합 시험 중 **자기만의 마이그레이션 부분집합으로 스키마를 세우고 그 모델의 `create()`를 부르는 파일**(예: `f03-session`의 `MIGRATIONS` 상수)이 `Unknown column`으로 깨진다 — 그런 파일을 전부 찾아 새 마이그레이션(과 그것이 참조하는 선행 마이그레이션)을 목록에 더한다(F-29b 실측: 전체 시험에서 8건 실패). 계획의 시험 항목에 이 넷을 명시하고, 구현은 done 전에 실행기로 `tests/db` 전체를 f01-migrations를 맨 앞에 두고 한 번 돌린다.

## 3. 조각별 담당

| 조각 | 담당 | 하지 않는 것 |
|---|---|---|
| **CB — F32a** | §2-1(상품 테이블·목록 API·외부 작성자 계약 문서) · §2-2의 topup 3개 · §2-3 | 골드 구매. 화면 |
| **CC — F32b** | §2-2의 gold-purchases · §2-4. CB의 상품 테이블·조회를 **재사용** | 충전. 화면 |
| **CH — F32c** | §2-5 | 서버 코드 |
| **BQ — F32 본 조각** | §2-6 | 앞 세 조각의 재구현 |

## 4. 시험으로 고정할 것

| 계약 | 증명 방식 | 담당 |
|---|---|---|
| 상품 등록→목록 반영→수정→재조회 반영→판매 중지 후 주문 거부(서버 재시작 없이) | DB 시험 — 외부 작성자를 모사한 별도 연결로 쓰기 | CB |
| 주문 스냅샷 유지 | 주문 뒤 상품 가격 변경·삭제 → 승인 대조·지급은 원래 값 | CB |
| 단일 지급 | 같은 confirm 2회·동시 confirm·③ 실패 뒤 재시도 → 원장 1건, 잔액 1회 증가 | CB(DB 시험) |
| 금액 불일치·타 계정·실패/취소·키 없음 → 미지급 | API 시험(가짜 어댑터) | CB |
| live 키 거부 | 설정 단위 시험 | CB |
| 골드 구매 원자성 | DB 시험 — 잔액 부족, 동시 요청 2건, 같은 referenceEventId 재시도, 중간 실패 롤백 | CC |
| 마이그레이션 | 재실행 안전·`verify()`·기존 경제 데이터 보존 | CB |
| 화면 상태·복귀 처리·잔액 갱신 | 실제 컴포넌트·훅 마운트 시험 + production build | CH |
| 새로고침·재로그인 복원, 끝에서 끝 | 통합 시험 | BQ |

DB 시험은 격리 테스트 DB만 쓰고 같은 명령 맨 앞에 `tests/db/f01-migrations.integration.test.js`를 둔다.

## 5. 열어 둔 것
- 최종 상품표(가격·지급량·보너스·환산율) — 운영자가 나중에 정한다. 지금은 시험 시드의 임시값.
- 토스 테스트 키·실제 테스트 결제 — 외부 입력 대기, 미검증으로 남긴다.
- 외부 상품 등록 서버와의 실제 통합 — 그 서버 연결이 생기면 별도 기록.
