# F-32a 재화 상품표·다이아 충전 복구 계약

> 대상: 외부 상품 작성자(별도 백엔드)와 후속 CC·CH·BQ 구현자. 설계는 `docs/design/F-32-diamond-topup-gold-purchase.md`, 상위 계약은 `docs/requirements/2026-09-14-f32-db-product-contract.md`다.
> **이 문서의 모든 숫자·상품 ID는 예시이며 자동 시험용 임시값이다. 최종 상품표(가격·지급량·보너스·환산율)는 운영자가 나중에 정하고, 이 문서나 마이그레이션에 확정되지 않았다.**

## 1. 무엇이 있는가

| 항목 | 위치 |
|---|---|
| 상품 테이블 `economy_currency_products` | 마이그레이션 `backend/db/migrations/0018-add-currency-products-topup-orders.js`, 모델 `backend/models/economy/currencyProduct.model.js` |
| 충전 주문 테이블 `economy_topup_orders` | 같은 마이그레이션, 모델 `backend/models/economy/topupOrder.model.js` |
| 상품 조회·검증 | `backend/service/currencyProducts.service.js` |
| 주문·승인·지급·복구 | `backend/service/topup.service.js` |
| 결제 어댑터(토스 테스트 승인) | `backend/payments/tossAdapter.js` |

게임 서버는 상품을 **요청할 때마다 DB에서 읽는다**(캐시·하드코딩 대체 없음, DB 오류 시 빈 목록이나 기본 상품으로 대체하지 않고 5xx). 외부 작성자가 커밋하면 다음 조회·다음 주문에 반영되며 서버 재시작이 필요 없다. 이 마이그레이션은 **운영 상품을 넣지 않는다.**

## 2. 상품 테이블 `economy_currency_products` (외부 작성자가 쓴다)

| 컬럼 | 타입 | NULL | 기본값 | 규칙 |
|---|---|---|---|---|
| `product_id` | VARCHAR(64) | 불가 | — | **기본키**, 안정적인 상품 ID(1~64자) |
| `kind` | VARCHAR(20) | 불가 | — | `DIAMOND_TOPUP` ｜ `GOLD_PURCHASE` |
| `display_name` | VARCHAR(100) | 불가 | — | 1~100자 |
| `pay_currency` | VARCHAR(10) | 불가 | — | `DIAMOND_TOPUP`이면 `KRW`, `GOLD_PURCHASE`이면 `DIAMOND` |
| `pay_amount` | INT | 불가 | — | 양의 정수, 1,000,000,000 이하 |
| `grant_currency` | VARCHAR(10) | 불가 | — | `DIAMOND_TOPUP`이면 `DIAMOND`, `GOLD_PURCHASE`이면 `GOLD` |
| `grant_amount` | INT | 불가 | — | 양의 정수(기본 지급량) |
| `bonus_amount` | INT | 불가 | `0` | 0 이상의 정수 |
| `status` | VARCHAR(10) | 불가 | — | `ON_SALE` ｜ `STOPPED` (대소문자 정확히) |
| `sort_order` | INT | 불가 | `0` | 목록 정렬(오름차순, 같으면 `product_id` 순) |
| `version` | INT | 불가 | `1` | 양의 정수. **가격·지급량·판매 상태 등 상품 내용을 바꿀 때마다 1 증가** |
| `created_at`, `updated_at` | DATETIME | 불가 | 현재 시각 | 직접 채울 때는 UTC 기준 |

- 허용 조합은 둘뿐이다: `DIAMOND_TOPUP = KRW→DIAMOND`, `GOLD_PURCHASE = DIAMOND→GOLD`.
- **지급 합계 `grant_amount + bonus_amount`는 1,000,000,000 이하**여야 한다(기존 원장이 받아 주는 한도).
- 서버는 읽을 때 위 규칙을 다시 검사한다. 어긋난 행(잘못된 통화 조합, 0·음수 수량, 음수 보너스, 한도 초과, 알 수 없는 종류·상태, version 0 이하)은 목록과 신규 주문에서 **조용히 제외**된다. 오류가 아니라 "없는 상품"(`PRODUCT_NOT_FOUND`)으로 보인다.
- **수정은 한 트랜잭션(한 문장)으로**: 상품 필드와 `version + 1`을 같이 갱신한다. 필드만 바꾸고 version을 올리지 않으면, 오래된 화면이 새 가격을 모른 채 이전 버전으로 주문을 시도해도 통과해 버린다.
- 판매 중지는 `status = 'STOPPED'`(+ version 증가)이다. 삭제해도 이미 만들어진 주문은 영향을 받지 않는다(주문은 상품 FK가 없다).

### 등록·변경 예시 (시험 전용 — 운영 값이 아니다)

```sql
-- 등록 (임시 값)
INSERT INTO economy_currency_products
  (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount,
   status, sort_order, version, created_at, updated_at)
VALUES ('test-topup-1', 'DIAMOND_TOPUP', '시험용 다이아 상품', 'KRW', 1000, 'DIAMOND', 100, 10,
        'ON_SALE', 0, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP());

-- 변경: 내용과 version을 한 문장(원자적)으로
UPDATE economy_currency_products
   SET pay_amount = 2000, grant_amount = 250, bonus_amount = 30, version = version + 1, updated_at = UTC_TIMESTAMP()
 WHERE product_id = 'test-topup-1';

-- 판매 중지
UPDATE economy_currency_products
   SET status = 'STOPPED', version = version + 1, updated_at = UTC_TIMESTAMP()
 WHERE product_id = 'test-topup-1';
```

## 3. 충전 주문 `economy_topup_orders` (게임 서버가 쓴다 — 외부 작성자는 읽지도 쓰지도 않는다)

주문 생성 시 상품의 `product_id·version·pay_amount·grant_amount·bonus_amount`와 표시 이름(`order_name`)을 **스냅샷으로 저장**한다. 승인 금액 대조와 지급은 항상 이 스냅샷을 쓴다 — 주문 뒤에 상품 가격·지급량·버전이 바뀌거나 상품이 삭제되어도 원래 값이 유지된다. 클라이언트가 보낸 금액·지급량은 대조용일 뿐 신뢰하지 않는다.

- `order_id` VARCHAR(64) **기본키**(서버 생성 UUID), `user_id` UUID → `users.uuid` FK, `payment_key` VARCHAR(200) **NULL 가능·유일**(한 결제키는 최대 한 주문), `status`, 임대(`lease_token`, `lease_expires_at`), `approved_at`, `granted_at`, `failure_code`.
- 단일 지급은 세 제약이 함께 보장한다: 주문 `order_id` 기본키 + `payment_key` 유일 인덱스 + 원장 `(user_id, reference_event_id = 'topup:{order_id}')` 유일 인덱스. 제공자 멱등키의 유효기간에만 의존하지 않는다.

### 상태와 복구

| 상태 | 뜻 | 다음 |
|---|---|---|
| `CREATED` | 스냅샷 저장, 아직 승인 요청 없음 | confirm → `CONFIRMING`. **조회(GET)만으로는 승인·지급하지 않는다**(결제창 복귀 쿼리도 무시) |
| `CONFIRMING` | 결제키 저장, 제공자 승인 확인 중(또는 결과를 알 수 없음) | 임대가 유효하면 다른 처리자가 진행 중. 임대가 없거나 만료되면 다음 confirm·조회가 **저장된 결제키로 제공자 상태를 조회**해 이어 간다 |
| `PENDING_GRANT` | 제공자가 승인(DONE)한 사실이 저장됐고 지급이 아직 안 끝남 | 같은 confirm·조회가 지급을 이어서 끝낸다 |
| `GRANTED` | 지급 완료(원장 1건·잔액 증가·주문 상태가 한 트랜잭션) | 종단 |
| `FAILED` / `CANCELED` / `EXPIRED` | 제공자가 확인한 실패·취소·만료 — **미지급** | 종단(다시 승인하지 않는다) |

- **승인 불명 ≠ 지급 대기.** 전송 오류·timeout·5xx·깨진 응답·입금 대기는 "승인 여부를 모른다" — 실패로 단정하지 않고 `CONFIRMING`으로 둔다(confirm은 재시도 가능한 503 `PAYMENT_PROCESSING`). `PENDING_GRANT`는 "제공자가 승인했음이 확인·저장됐고 지급만 남았다"이다.
- 외부 승인 호출 동안 **주문·지갑 DB 잠금을 잡지 않는다.** 임대 토큰을 조건으로 결과를 저장하므로, 임대를 잃은 늦은 처리자가 새 결과를 덮지 못한다.
- 요청당 외부 호출은 최대 3회(승인 1 + 조회 1 + 재승인 1)로 제한된다. 승인 멱등키는 `topup-confirm:{order_id}`로 주문에서 복원되어 재시도·새 서비스 인스턴스에서도 같다.

## 4. HTTP API 요약 (모두 `/economy` 아래, 로그인 필요)

| 요청 | 성공 | 오류 코드 |
|---|---|---|
| `GET /economy/currency-products?kind=` | `{ok:true, products:[{productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, version}]}` (판매 중·유효한 것만, 없으면 `[]`) | `INVALID_PRODUCT_KIND`(400), DB 실패는 5xx |
| `POST /economy/topup/orders` `{productId, version}` | 201 `{ok:true, orderId, amount, orderName, clientKey}` | `PRODUCT_NOT_FOUND`(404), `PRODUCT_STOPPED`(409), `PRODUCT_VERSION_MISMATCH`(409, 현재 상품 `product`), `CONFIG_MISSING`(503), 필드 오류 400 |
| `POST /economy/topup/orders/:orderId/confirm` `{paymentKey, amount}` | `{ok:true, status:'GRANTED', balanceDiamond}` 또는 `{ok:true, status:'PENDING_GRANT'}` | `ORDER_NOT_FOUND`(404), `NOT_OWNER`(403), `AMOUNT_MISMATCH`(400), `PAYMENT_KEY_MISMATCH`·`PAYMENT_KEY_CONFLICT`(409), `PAYMENT_FAILED`(402), `PAYMENT_PROCESSING`(503, 재시도 가능), `CONFIG_MISSING`(503) |
| `GET /economy/topup/orders/:orderId` | `{ok:true, orderId, status, amount, orderName, productId, version, grantAmount, bonusAmount, balanceDiamond?, createdAt}` | `ORDER_NOT_FOUND`, `NOT_OWNER` |

이 범위의 오류 응답은 원본 메시지·스택·중첩 데이터를 싣지 않고 고정 코드·문구만 낸다(`Cache-Control: no-store`). `PAYMENT_KEY_MISMATCH`·`PAYMENT_KEY_CONFLICT`는 설계도 표의 코드에 더해 추가된 것이다.

## 5. 테스트 키 설정

서버 환경변수(프런트로 나가지 않는다):

| 변수 | 형식 |
|---|---|
| `TOSS_TEST_CLIENT_KEY` | `test_ck_…` (공개 clientKey — 주문 생성 응답으로만 나간다) |
| `TOSS_TEST_SECRET_KEY` | `test_sk_…` (서버 전용) |

누락·live 키(`live_ck_`/`live_sk_`)·접두어가 어긋난 혼합·형식 오류는 외부 호출 전에 `CONFIG_MISSING`으로 거부되고 주문 상태도 바뀌지 않는다. 접두어 검사는 **형식 검증**이며 같은 상점의 유효한 키 쌍인지는 실제 토스 호출 없이 확인하지 않는다.

## 6. 검증 명령

`backend` 작업 디렉터리, 파일 간 동시 실행 없이:

```
node --test --test-concurrency=1 __tests__/topup.route.test.js __tests__/topup.security.test.js __tests__/f32a.migration.test.js payments/__tests__/tossAdapter.test.js __tests__/economy.route.test.js __tests__/schema.existingTables.test.js __tests__/isolatedTestDb.guard.test.js __tests__/economy.migration.test.js service/economy.service.test.js
```

DB 시험은 격리 테스트 DB(`F01_TEST_DATABASE_URL`, 승인 이름과 실제 `DATABASE()`가 일치)에서만, **별도 명령의 첫 파일 인자로 `tests/db/f01-migrations.integration.test.js`를 두고** 나머지 `tests/db`의 실제 시험 파일(`f31-social-email`, `f32a-topup` 포함)을 중복 없이 뒤에 전달해 `--test-concurrency=1`로 한 번 끝까지 실행한다. DB 미설정·연결 실패·skip은 통과가 아니다.

## 7. 미검증·범위 밖 (이 문서가 확정하지 않는다)

- **최종 상품표(가격·지급량·보너스·환산율)** — 운영자가 나중에 정한다. 시험과 이 문서의 수치는 임시값이다.
- **실제 토스 테스트 키 세트와 실제 테스트 결제** — 실행하지 않았다(가짜 어댑터·HTTP 전송 대역으로만 검증). 미검증.
- **외부 상품 등록 서버와의 실제 통합** — 시험은 별도 DB 연결로 외부 작성자를 모사했을 뿐이다. 미검증.
- 골드 구매(CC)·충전 화면과 토스 결제창 복귀(CH)·새로고침 복원 통합(BQ)·환불·정기결제·취소 API는 이 조각의 범위가 아니다.
