# F-08 지갑·거래·카탈로그·소유권 — 이관·복구·검증 기록

날짜: 2026-09-09 최초 작성, 2026-09-10 R-IMPL(반송) 대응으로 갱신
슬라이스: Pluto AS (F-08)

이 문서는 두 회차를 함께 기록한다: (1) 최초 구현 — 계획의 "새로 만들 것" 6개 모듈을
신규로 구현, (2) R-IMPL 반송 대응(2026-09-10) — 운영자가 정확한 커밋(`2d7c3976`)과
파일 4개의 스코프 플래그 14개를 검토한 뒤 지적한 실질적 결함을 수정. 아래 "R-IMPL
반송 대응"절이 이번 회차에 실제로 바뀐 내용이고, 그 이전 절들은 최초 구현 시점 기록을
필요한 만큼 갱신했다.

## R-IMPL 반송 대응(2026-09-10) — 무엇을 왜 고쳤는가

운영자 지적 6가지를 각각 대응했다:

1. **GOLD·DIAMOND 두 재화** — F-08 요구사항은 두 재화 모두 정수 잔액, 초기값 0/0을
   명시하는데 이전 버전은 `balance_gold`만 구현했다. `economy_wallets`에
   `balance_diamond` 컬럼을 추가하고, `economy_ledger_entries`에 `currency` 컬럼을
   추가해 모든 원장 기록이 재화 종류를 명시한다. `economy.service.js`는
   `CURRENCIES.{GOLD,DIAMOND}`와 `CURRENCY_TO_WALLET_COLUMN`으로 재화별 잔액 컬럼을
   선택하고, 지급/차감 전에 `isBoundedAmount`(정수·안전 정수·`MAX_BALANCE`=10억 이하)로
   서버 저장값 범위를 벗어난 금액을 지갑을 건드리기 전에 거부한다(오버플로 방지, DB
   INTEGER 컬럼 범위보다 충분히 작게 잡음). 구매 가능한 코스메틱은 여전히 GOLD로만
   판매한다(`purchaseItem`이 항상 `CURRENCIES.GOLD`로 호출) — 현금 충전·재화 패키지
   판매·이모티콘 소유권은 여전히 범위 밖이다.
2. **AC-02/AC-06 크로스 계정 idempotency 결함(치명)** — 이전 `applyLedgerTransaction`은
   `reference_event_id`만으로(계정 무관) 전역 조회해 기존 원장 행을 그대로 돌려줬다.
   다른 계정이 남의 참조 사건 ID를 그대로 제출하면 그 계정의 원장 행을 조회해 돌려받고
   (계정 간 정보 노출), 같은 계정이 같은 키를 다른 내용(다른 상품·다른 금액)으로
   재전송해도 이전 결과를 "성공"으로 잘못 돌려줬다. 지금은 (user_id,
   reference_event_id) 복합 유일 인덱스로 바꾸고, 조회도 항상 `user_id`로 좁힌다. 기존
   행을 찾으면 지금 요청과 같은 조작(`reason`·`itemId`·`currency`·`amount`)인지
   `payloadMatches`로 비교해, 다르면 원래 결과를 노출하지 않고 일반화된
   `REFERENCE_EVENT_CONFLICT`(409)로 거부한다. 이 재확인은 지갑 잠금을 잡은 **뒤**,
   소유권/잔액 검증보다 **먼저** 한 번 더 실행된다(recheck-after-lock) — 동시에 들어온
   같은 키 재시도가 늦게 잠금을 얻어도 원래 커밋된 결과를 그대로 돌려받는다(소유권 재검사
   때문에 잘못 거부되지 않는다).
3. **QA 권한의 실제 서버 데이터 검증** — `/economy/admin/grant`는 이전에
   `req.user.role`(로그인 시점 JWT 클레임, 이후 권한이 바뀌어도 세션 만료 전까지 갱신
   안 됨)을 그대로 믿었다. 지금은 매 요청마다 `userRepository.findByUuid(req.user.uuid)`로
   실제 계정 행을 다시 읽어 "지금 이 순간"의 `role`로 판정한다 — 토큰 클레임과 실제 DB
   값이 다른 경우(권한 회수 등)를 `economy.route.test.js`에 별도 테스트로 고정했다. QA
   역할 자체는 이 저장소에 이미 있던 자유 문자열 `role` 컬럼(가입 경로에는 없고 직접
   시딩으로만 부여, `ADMIN`과 동일한 성격)이며 이 슬라이스가 새 가입 경로나 셀프서비스
   승격을 추가하지 않았다 — mock에만 존재하는 가상의 역할이 아니라, 실제 계정 레코드에
   저장된 값을 검증 기준으로 삼는다는 뜻이다.
4. **경제 마이그레이션 파일 부재** — 이전 버전은 economy_* 4개 테이블을 마이그레이션
   없이 `sequelize.sync({force:false})`로만 만들어, 0001~0005가 세운 관례(체크섬·
   재실행 안전성·복구 절차)를 벗어났다. `backend/db/migrations/0006-add-economy.js`를
   추가해 0005와 같은 패턴(존재 확인 후 생성, `verify`, `down`)으로 4개 테이블을
   관리한다. `backend/tests/helpers/isolatedTestDb.js`의 `buildManagedSchema`에 선택
   인자 `addEconomy`를 추가해 economy 테이블을 공유 관리 목록·드롭 순서에 편입했다(기존
   호출부는 `addEconomy`를 넘기지 않으므로 동작이 완전히 그대로다). `backend/__tests__/
   economy.migration.test.js`(신규)가 fake queryInterface + migrationRunner의 fake
   sequelize로 멱등성·`verify`·`down`·이력 기반 재적용 방지를 실제 MySQL 없이 검증한다.
5. **안전하지 않은 자체 DB 리셋 로직** — 이전 `f08-economy.integration.test.js`는
   URL 이름에 `f08`/`economy`가 있는지 정규식만 보고 실제 `SELECT DATABASE()`와 대조하지
   않았고, 설정 오류도 조용히 skip으로 삼켰으며, f01~f07이 쓰지 않는
   `F08_TEST_DATABASE_URL`을 요구했다. 지금은 f05/f07과 완전히 같은 방식으로
   `F01_TEST_DATABASE_URL` + `backend/tests/helpers/isolatedTestDb.js`(승인된 이름
   allowlist + 실제 `SELECT DATABASE()` 대조 + 미지 테이블 거부)를 그대로 재사용하고,
   0001~0006 전체 마이그레이션 체인을 적용한다. 크로스 계정 참조 사건 ID 재사용, 같은
   계정의 내용 불일치 재사용, 동시 재시도(같은 키/다른 키), 원장 쓰기 실패 후 롤백,
   마이그레이션 재실행 보존 테스트를 추가했다(아래 "AC별 근거" 참고).
6. **프론트 계정 격리 결함** — `economy.store.js`가 로그아웃/계정 전환에 전혀 반응하지
   않아, 로그아웃해도 잔액·소유품·`pendingPurchases`가 남고 지연 도착한 이전 계정의
   응답이 다음 계정 화면을 덮어쓸 수 있었다. `requestGeneration` 카운터를 추가해
   `useAuthStore.subscribe`로 계정 식별자(`user.uuid`) 변경(로그아웃 포함)마다 즉시
   전체 리셋 + 세대 증가시키고, `fetchSummary`/`purchase`/`equip`의 모든 비동기 완료
   지점에서 "시작 시점 세대"와 "지금 세대"를 비교해 다르면 응답을 조용히 버린다. 또한
   서버가 `code`와 함께 명시적으로 거부한 경우(`status: "rejected"`)와 응답 자체를 받지
   못한 전송 불확실 상태(`status: "unknown"`)를 구분해, 재시도 시 전자는 새 참조 사건
   ID를, 후자는 같은 참조 사건 ID를 쓴다.

## 만든 것(최초 구현, 이번 회차에도 유지)

- `backend/economy/catalog.js` — 서버 상품 카탈로그(변경 없음). 프로필 사진 16종 + 평민
  테두리 1종(기본 지급, 가격 0, 구매 불가), 등급 테두리 6종·스킨 9종·플레이어 카드 8종
  (구매 가능, 모두 GOLD). 현금 충전·재화 패키지·이모티콘은 제외.
- `backend/models/economy/economy.model.js` — `EconomyWallet`(GOLD·DIAMOND 두 재화
  정수 잔액)·`EconomyLedgerEntry`(원인·`currency`·금액·`balance_after`·(user_id,
  reference_event_id) 복합 유일 인덱스)·`EconomyEntitlement`((user_id, item_id) 유일
  제약)·`EconomyLoadout`. 실제 DDL은 `backend/db/migrations/0006-add-economy.js`가
  책임진다 — 이 파일은 그 결과 스키마와 항상 같은 모양을 유지해야 한다(신규).
- `backend/db/migrations/0006-add-economy.js`(신규, R-IMPL) — economy 4개 테이블을
  0001~0005와 같은 관례로 관리한다.
- `backend/service/economy.service.js` — 구매·기본 지급·QA/보상 지급을 모두
  `applyLedgerTransaction` 하나로 처리한다. 잠금 → recheck-after-lock(재처리 방지) →
  소유 여부 확인 → 잔액/한도 검증 → 지갑 갱신 → 원장 기록 → 소유권 부여 순서가 AC-01/
  AC-02의 핵심이다.
- `backend/routes/economy.routes.js` — `GET /economy/accounts/:userId/{wallet,
  entitlements,transactions}`(본인만, AC-06, 응답에 `balanceDiamond` 포함) ·
  `POST /economy/purchase` · `POST /economy/equip` ·
  `POST /economy/admin/grant`(실제 계정 행의 QA/ADMIN role만, `amount`+`currency`
  본문).
- `frontend/src/domains/economy/store/economy.store.js` — 잔액(GOLD/DIAMOND)·소유품·
  장착 상태를 복원하는 zustand store. `requestGeneration`으로 계정 격리를 보장하고,
  구매 실패를 `rejected`(서버 확정 거부)/`unknown`(전송 불확실)로 구분한다.
- `backend/__tests__/economy.migration.test.js`(신규, R-IMPL)
- `docs/requirements/2026-09-09-f08-economy-evidence.md`(본 문서)

## 계획에는 없었지만 필요해서 한 것(계획 밖 최소 배선)

- `backend/index.js` — `economyRouter` require + `app.use("/economy", economyRouter)`
  2줄(최초 구현 시 추가, 변경 없음).
- `backend/__tests__/schema.existingTables.test.js` — `NEW_MODELS`에 `EconomyLedgerEntry`
  (최초 구현 시 추가, 변경 없음 — `EXISTING_TABLES` 스냅샷은 여전히 손대지 않았다).
- `backend/tests/helpers/isolatedTestDb.js` — `buildManagedSchema`에 선택 인자
  `addEconomy` 추가(R-IMPL, 이번 회차). f01~f07·`user.accountPaths.test.js` 호출부는
  이 인자를 넘기지 않아 동작이 완전히 그대로다(`isolatedTestDb.guard.test.js`로 확인).

## 의도적으로 하지 않은 것

- 화면 컴포넌트(.jsx)를 새 `/economy/*` API·`economy.store`에 연결하는 작업은 여전히
  범위 밖이다 — 다음 슬라이스(F-09/F-13)가 상점·마이페이지 화면에서 `useEconomyStore`를
  실제로 소비해야 한다.
- 직업별 스킨 장착(`skinsByJob`)은 서버에 영속화하지 않는다(AC-03이 요구하는 기본 지급
  대상은 "프로필 16종 + 평민 테두리 1종"까지다). `economy_loadouts`에
  `selected_skins_by_job` 컬럼을 추가하는 것은 향후 슬라이스 몫이다.
- 현금 충전·재화 패키지 판매·이모티콘 소유권은 이번에도 추가하지 않았다(운영자 지적에
  명시적으로 제외됨).
- 셀프서비스로 QA 역할을 부여하는 경로는 만들지 않았다 — QA/ADMIN 모두 여전히 직접
  DB 시딩으로만 부여되는 값이며, 이 슬라이스는 그 값을 "검증하는 곳"(라우트)만 고쳤다.

## AC별 근거

- **AC-01(동시 구매 무결성)** — 서비스 단위 시험(fake db, 사용자별 FIFO 잠금 큐)이
  동일 상품 동시 구매(정확히 한 성공, 나머지 `ITEM_ALREADY_OWNED`, 잔액==원장 합계,
  소유권 중복 없음)와 서로 다른 참조 사건 ID의 동시 지급(둘 다 독립적으로 성공)을
  검증한다. `f08-economy.integration.test.js`가 같은 두 시나리오를 실제 MySQL 행 잠금
  위에서 재검증한다(F01_TEST_DATABASE_URL 필요, 미검증 항목 참고).
- **AC-02(재처리 방지 키, R-IMPL로 범위 확장)** — 서비스 단위 시험 6건: 같은 키 재전송
  멱등, 기본 지급 재호출 중복 없음, **같은 계정이 같은 키를 다른 상품에 재사용하면
  이전 결과를 노출하지 않고 거부**, **다른 계정이 같은 키 문자열을 제출해도 서로
  독립적으로 처리**(크로스 계정 격리, AC-06과 겹침), **동시에 들어온 같은 키 재시도는
  하나만 실제 처리되고 나머지는 같은 커밋 결과**, **지갑 갱신 뒤 원장 쓰기가 실패하면
  잔액이 롤백**. DB 통합 시험이 이 6가지를 모두 실제 MySQL 유일 인덱스·트랜잭션 위에서
  재검증한다(미검증 항목 참고). 프론트 `economy.store.js`는 서버 확정 거부(`rejected`)와
  전송 불확실(`unknown`)을 구분해 재시도 전략을 달리한다(`economy.store.test.js`).
- **AC-03(기본 지급)** — 서비스 단위 시험이 신규 계정(엔터티 17개, 프로필 16 + 테두리
  1, 중복 없음, 기본 선택 = 금빛가면/평민, GOLD·DIAMOND 잔액 0/0)과 기존 호출 반복을
  검증한다. A-04(기존 유효 선택 보존)도 별도 테스트로 고정했다. DB 통합 시험이 같은
  시나리오를 실제 MySQL로 재확인한다.
- **AC-04(서버 가격 신뢰)** — 라우트는 요청 본문에서 `itemId`·`referenceEventId`만
  읽는다. 서비스 시험은 카탈로그 가격 기준 잔액 부족 거부, 카탈로그에 없거나 구매
  불가한 itemId 거부, **DIAMOND 지급이 GOLD 잔액을 바꾸지 않음**, **안전 정수 범위를
  벗어난 금액은 지갑을 건드리기 전에 거부**(오버플로 방지), **알 수 없는 재화 거부**를
  확인한다.
- **AC-05(소유권·종류 검증)** — 서비스 시험 3건(미보유 거부 403·임의 문자열 거부 400·
  슬롯-종류 불일치 거부 400) + 정상 보유 시 성공 1건. 라우트 시험은 서비스가 던진
  코드가 그대로 HTTP 상태로 나가는지 확인한다.
- **AC-06(계정 간 접근 차단, R-IMPL로 범위 확장)** — `economy.route.test.js`: 쿠키
  없음 401, 다른 계정 `:userId` 조회 403(`ECONOMY_FORBIDDEN`), 본인 조회 200(GOLD·
  DIAMOND 둘 다 포함). **관리자 전용 지급 경로는 토큰 클레임이 아니라 실제 계정 행의
  role로 판정된다**(토큰은 QA인데 실제 계정은 USER인 경우 거부, 반대도 검증). 크로스
  계정 참조 사건 ID 재사용이 서로의 원장에 영향을 주지 않는다는 것은 위 AC-02와 함께
  검증한다.

## 실행한 검증(R-IMPL 반송 대응, 2026-09-10)

- `node impl-check.js node-test backend/service/economy.service.test.js` — **19 pass /
  0 fail**.
- `node impl-check.js node-test backend/__tests__/economy.route.test.js` — **12 pass /
  0 fail**.
- `node impl-check.js node-test backend/__tests__/economy.migration.test.js` — **5 pass
  / 0 fail**.
- `node impl-check.js node-test backend/tests/db/f08-economy.integration.test.js` —
  **0 pass / 0 fail / 10 skipped**(`F01_TEST_DATABASE_URL` 미설정 — 미검증, 아래 참고).
  더 이상 `F08_TEST_DATABASE_URL`을 요구하지 않고 f01~f07과 같은 변수를 본다.
- `node impl-check.js node-test backend/__tests__/isolatedTestDb.guard.test.js` —
  **10 pass / 0 fail**(`buildManagedSchema`에 `addEconomy` 선택 인자를 추가한 뒤에도
  기존 호출 계약이 그대로임을 확인).
- `npm test --prefix backend`(백엔드 전체) — **1,185 pass / 0 fail / 53 skipped**
  (1,238 total). skip은 전부 `F01_TEST_DATABASE_URL` 미설정에 의한 기존 관례이고,
  실패를 skip으로 위장하지 않았다. 이전 회차에 보고된 `fetch failed: bad port` 플레이키는
  이번 실행에서 재현되지 않았다.
- `npm test --prefix frontend`(프론트 전체) — **1,254 pass / 0 fail / 0 skipped**.
  `economy.store.test.js`가 7개 → 13개로 늘었다(계정 격리·지연 응답·확정 거부/전송
  불확실 구분 6건 추가). 기존 스위트 회귀 없음.
- `npm run build --prefix frontend` — production build **exit 0**(경고: 메인 청크
  500KB 초과 — 이 슬라이스 이전부터 있던 번들 구성, 범위 밖).
- `node impl-check.js test`/`node impl-check.js build`(레포 루트) — 루트
  `package.json`의 `test`/`build` 스크립트가 각각 `exit 1` 스텁·정의 없음이라(이
  슬라이스 이전부터 있던 상태) 그대로 실행하면 항상 실패한다 — 이 슬라이스가 만든
  결함이 아니라서 고치지 않았고, 대신 위 `npm test --prefix backend`/`--prefix
  frontend`로 각 패키지를 직접 확인했다.

## 미검증 항목(readiness_unverified)

- **AC-01/AC-02/AC-03/AC-06을 실제 MySQL 행 잠금·복합 유일 인덱스·트랜잭션 롤백
  위에서 검증** — `backend/tests/db/f08-economy.integration.test.js`가 f01~f07과 같은
  `F01_TEST_DATABASE_URL`을 기다리지만 이 세션에는 설정돼 있지 않아 skip됐다. 이
  세션의 명령 승인 절차상 Docker exec/DB 리셋을 직접 실행할 수 없다(운영자 지시: 이
  파일 밖에서 별도 DB를 만들거나 조작하지 말 것) — 로컬에서 실행이 거부된 것이
  DB 자체의 부재를 뜻하지 않는다. 운영자 또는 정규 VERIFY 단계가
  `F01_TEST_DATABASE_URL`을 채워 재실행해야 한다.
- **실제 브라우저에서 상점/마이페이지 화면이 `/economy/*` API를 실제로 호출하는지** —
  데이터 계층만 만들었고 화면 연결은 범위 밖이라 브라우저 검증 대상이 아직 없다.

## 복구 절차

아래 목록이 이번 회차까지 이 슬라이스가 고친 전체 파일이다 — 롤백이 필요하면 이
목록을 지우거나 이전 커밋으로 되돌리면 된다. 기존 테이블 스키마 변경은 없다(신규
`economy_wallets`/`economy_ledger_entries`/`economy_entitlements`/`economy_loadouts`
4개 테이블만 추가, 이제 `0006-add-economy.js` 마이그레이션으로 관리됨).

- `backend/economy/catalog.js`
- `backend/models/economy/economy.model.js`
- `backend/db/migrations/0006-add-economy.js`(신규, R-IMPL)
- `backend/service/economy.service.js`
- `backend/service/economy.service.test.js`
- `backend/routes/economy.routes.js`
- `backend/__tests__/economy.route.test.js`
- `backend/__tests__/economy.migration.test.js`(신규, R-IMPL)
- `backend/tests/db/f08-economy.integration.test.js`
- `backend/tests/helpers/isolatedTestDb.js`(`addEconomy` 선택 인자 추가, R-IMPL)
- `backend/index.js`(economy 라우터 마운트 2줄)
- `backend/__tests__/schema.existingTables.test.js`(`NEW_MODELS`에 `EconomyLedgerEntry`
  추가)
- `frontend/src/domains/economy/store/economy.store.js`
- `frontend/src/domains/economy/store/__tests__/economy.store.test.js`
- `docs/requirements/2026-09-09-f08-economy-evidence.md`(본 문서)
