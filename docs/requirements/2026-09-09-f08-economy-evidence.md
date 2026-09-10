# F-08 지갑·거래·카탈로그·소유권 — 이관·복구·검증 기록

날짜: 2026-09-10
슬라이스: Pluto AS (F-08)

이 슬라이스는 `.pluto/instruction.md`의 "새로 만들 것" 6개 모듈을 신규로 구현했다 —
이전 시도의 흔적(`.pluto/done.json` 없음)이 없어 이관할 기존 코드가 없다. 이 문서는
요구사항별 검증 결과와 미검증 사유를 기록한다.

## 만든 것

- `backend/economy/catalog.js` (신규) — 서버 상품 카탈로그. 프로필 사진 16종 + 평민
  테두리 1종(기본 지급, 가격 0, 구매 불가), 등급 테두리 6종·스킨 9종·플레이어 카드 8종
  (구매 가능, `frontend/src/domains/store/constants/storeItems.js`/
  `skinCardWearCatalog.js`와 같은 id·가격). 현금 충전·재화 패키지(`INGAME_MONEY_STORE_ITEMS`)는
  계획 메모에 따라 제외했다.
- `backend/models/economy/economy.model.js` (신규) — `EconomyWallet`(정수 잔액)·
  `EconomyLedgerEntry`(원인·금액·`balance_after`·`reference_event_id` 전역 유일 제약)·
  `EconomyEntitlement`((user_id, item_id) 유일 제약)·`EconomyLoadout`(선택된 프로필
  사진/테두리/카드 프레임) 4개 모델. `models/index.js` 로더가 파일당 모델 하나만
  `db[name]`에 등록하므로(계획이 이 파일 하나만 지정) `EconomyLedgerEntry`만 반환하고
  나머지 3개는 `sequelize.define`으로만 등록한다 — 파일 상단 주석에 이 제약과 접근
  방법(`db.sequelize.models.*`)을 남겼다. 마이그레이션 파일은 만들지 않았다 —
  `backend/index.js`가 기동 시 실행하는 `db.sequelize.sync({force:false})`가 신규
  테이블을 그대로 만든다(이 저장소의 friend/game 도메인 테이블과 같은 방식이며, users를
  변경하는 게 아니라 새 테이블만 추가하므로 baseline처럼 별도 마이그레이션이 필요하지
  않다).
- `backend/service/economy.service.js` (신규) — 구매·기본 지급·QA/보상 지급을 모두
  `applyLedgerTransaction` 하나로 처리한다. 지갑 행을 `SELECT ... FOR UPDATE`로 잠근
  *뒤에* 소유 여부를 확인하는 순서가 AC-01의 핵심이다(순서가 반대면 동시 요청이 둘 다
  통과한다) — 아래 "AC-01" 절 참고.
- `backend/routes/economy.routes.js` (신규) — `GET /economy/accounts/:userId/{wallet,
  entitlements,transactions}`(본인만, AC-06) · `POST /economy/purchase` ·
  `POST /economy/equip` · `POST /economy/admin/grant`(QA/ADMIN role 전용). `backend/index.js`에
  `app.use("/economy", economyRouter)`로 연결했다(계획 밖 1줄, 새 라우터를 실제로
  연결하기 위한 필수 배선).
- `frontend/src/domains/economy/store/economy.store.js` (신규) — 잔액·소유품·장착 상태를
  복원하는 zustand store. `status`(idle/loading/ready/error)·`error`로 로딩·실패를
  구분하고, `retry()`로 재시도한다. 구매마다 `referenceEventId`를 새로 발급해
  `pendingPurchases[itemId]`에 보관하고, 실패(응답 유실 포함) 시에도 그 ID를 지우지
  않아 `retryPurchase(itemId)`가 같은 ID로 재시도할 수 있게 한다 — 서버의 재처리 방지
  키(AC-02)가 이 재시도를 안전하게 만든다.
- `docs/requirements/2026-09-09-f08-economy-evidence.md` (본 문서, 신규)

## 계획에는 없었지만 필요해서 한 것 (계획 밖 최소 배선, 파일 4·부품 8 한도 내)

- `backend/index.js` — `economyRouter` require + `app.use("/economy", economyRouter)`
  2줄. 새 라우터를 실제로 마운트하지 않으면 어떤 AC도 HTTP로 검증할 수 없다.
- `backend/__tests__/schema.existingTables.test.js` — `NEW_MODELS`에 `EconomyLedgerEntry`
  추가. 이 테스트는 "모델 목록에 추가·삭제·이름 충돌이 없다"를 스냅샷으로 고정하는
  회귀 가드라, 의도된 신규 모델 추가는 이 목록에 반영해야 통과한다(그러지 않으면
  의도적 추가와 사고성 추가를 구분할 수 없다). `EXISTING_TABLES`(컬럼·타입·PK·NOT NULL
  스냅샷)는 손대지 않았다 — 기존 테이블 스키마는 전혀 바뀌지 않았다.

## 의도적으로 하지 않은 것

- `frontend/src/domains/user/store/profileCustomization.store.js`,
  `skinCardWear.store.js` 자체는 수정하지 않았다. 두 파일은 계획의 "성공 조건별로 고른
  코드"에서 AC-05의 근거(로컬 상태를 검증 없이 적용한다는 취약점 증거)로 선택됐을
  뿐이며, AC-05가 요구하는 실제 방어는 서버(`economyService.equipItem`)의 책임이다.
  두 store를 그대로 둔 채 서버가 소유권·종류를 검증하는 방어를 추가했으므로, 두
  파일의 기존 동작·기존 테스트(`profileCustomization.store.test.js`,
  `skinCardWear.store.test.js`)는 전혀 건드리지 않았다(회귀 없음, 아래 "실행한 검증"
  참고). 화면 컴포넌트(.jsx)를 새 `/economy/*` API·`economy.store`에 연결하는 작업은
  이 슬라이스 범위 밖이다(계획된 파일 목록에 `.jsx`가 없음) — 다음 슬라이스가 상점·
  마이페이지 화면에서 `useEconomyStore`를 실제로 소비해야 한다.
- 직업별 스킨 장착(`skinsByJob`)은 서버에 영속화하지 않았다. AC-03의 기본 지급 대상은
  "프로필 16종 + 평민 테두리 1종"으로 명시돼 있고, 기본 스킨(`basic-skin-*`)·기본 카드
  프레임(`player-card-베이스`)은 모두 구매 대상이 아닌 항상-사용 가능 자원이라 소유권
  추적이 필요 없다. `economy.service.js`의 `equipItem`은 `PROFILE_PHOTO`·
  `PROFILE_BORDER`·`PLAYER_CARD_FRAME` 3개 슬롯만 지원한다 — 구매 가능한 프리미엄
  스킨(`SKIN` 타입)은 구매·소유권 조회까지는 지원하지만 전용 장착 슬롯은 없다(직업별
  맵을 저장하려면 별도 스키마가 필요해 이번 계획 범위를 넘는다). 향후 슬라이스가
  `economy_loadouts`에 `selected_skins_by_job`(JSON) 같은 컬럼을 추가해야 한다.

## AC별 근거

- **AC-01(동시 구매 무결성)** — `backend/service/economy.service.test.js`의
  "같은 계정으로 동일 상품을 동시에 두 번 구매 요청해도 한 번만 차감된다"가 인메모리
  fake db(사용자별 FIFO 잠금 큐로 `SELECT ... FOR UPDATE`를 흉내)로 검증한다: 정확히
  한 요청만 성공, 나머지는 `ITEM_ALREADY_OWNED`(409), 지갑 잔액 == 거래 원장 합계,
  소유권 중복 없음. 실제 MySQL 행 잠금 위에서 같은 시나리오를 재검증하는
  `backend/tests/db/f08-economy.integration.test.js`는 이 세션에 `F08_TEST_DATABASE_URL`이
  없어 **미검증**(skip)으로 남는다 — 아래 "미검증 항목" 참고.
- **AC-02(재처리 방지 키)** — 서비스 단위 시험(같은 참조 사건 ID로 재구매/재지급 2건)과
  DB 통합 시험(같은 참조 사건 ID로 재지급 1건, 미검증)이 검증한다. 프론트
  `economy.store.js`의 `pendingPurchases`/`retryPurchase`는 참조 사건 ID를 재사용해
  "응답 유실" 상황에서도 안전하게 재시도하는 클라이언트 쪽 계약을 시험한다
  (`economy.store.test.js`).
- **AC-03(기본 지급)** — 서비스 단위 시험이 신규 계정(엔터티 17개, 프로필 16 + 테두리
  1, 중복 없음, 기본 선택 = 금빛가면/평민)과 기존 호출 반복(재호출해도 중복 없음)을
  검증한다. A-04(기존 유효 선택 보존)도 별도 테스트로 고정했다. DB 통합 시험(미검증)이
  같은 시나리오를 실제 MySQL로 재확인한다.
- **AC-04(서버 가격 신뢰)** — 라우트는 요청 본문에서 `itemId`·`referenceEventId`만
  읽는다(`economy.route.test.js`가 `price`·`balance` 같은 임의 필드를 함께 보내도
  서비스 호출 인자에 남지 않음을 확인). 서비스 시험은 카탈로그 가격 기준으로 잔액이
  부족하면(클라이언트가 뭐라 주장하든) 거부됨과, 카탈로그에 없거나 구매 불가한 itemId가
  거부됨을 확인한다.
- **AC-05(소유권·종류 검증)** — 서비스 시험 3건(미보유 거부 403·카탈로그에 없는 임의
  문자열 거부 400·슬롯-종류 불일치 거부 400) + 정상 보유 시 성공 1건. 라우트 시험은
  서비스가 던진 코드가 그대로 HTTP 상태로 나가는지 확인한다.
- **AC-06(계정 간 접근 차단)** — `economy.route.test.js`: 쿠키 없음 401, 다른 계정
  `:userId`로 지갑/거래내역/소유품 조회 403(`ECONOMY_FORBIDDEN`), 본인 조회 200. 구매·
  장착은 URL에 계정을 받지 않고 항상 `req.user.uuid` 기준이라 애초에 다른 계정을
  지정할 방법이 없다.

## 실행한 검증

- `node impl-check.js node-test backend/service/economy.service.test.js` — **11 pass /
  0 fail**.
- `node impl-check.js node-test backend/__tests__/economy.route.test.js` — **10 pass /
  0 fail**.
- `node impl-check.js node-test backend/tests/db/f08-economy.integration.test.js` —
  **0 pass / 0 fail / 3 skipped**(`F08_TEST_DATABASE_URL` 미설정 — 미검증, 아래 참고).
  require·문법 오류 없이 정상적으로 skip 경로에 진입하는 것은 확인했다.
- `npm test --prefix backend`(백엔드 전체) — **1,169 pass / 0 fail / 46 skipped**
  (1,216 total, 1회 재실행). skip은 모두 `F01_TEST_DATABASE_URL`/`F08_TEST_DATABASE_URL`
  미설정에 의한 기존 관례이며, 실패를 skip으로 위장하지 않았다. 두 차례 실행 모두
  경제 로직과 무관한 서로 다른 파일에서 `fetch failed: bad port`가 1건씩 발생했다
  (1회차: `auth.sessionGuard.test.js`, 2회차: `discordOAuth.service.test.js`) — 매번
  다른, 경제 코드와 무관한 파일에서 발생해 이 슬라이스가 원인이 아닌 기존 환경
  플레이키(추정: `server.listen(0)`을 쓰는 다수 테스트 파일이 이 세션의 병렬 실행
  환경에서 간헐적으로 포트 주소를 늦게 읽는 문제)로 판단한다 — 재현 조건을 더
  좁히지 못해 고치지 않았다(경제 코드 범위 밖).
- `node impl-check.js node-test frontend/src/domains/economy/store/__tests__/economy.store.test.js`
  — 이 파일은 `mock.module`을 쓰므로 Node `--experimental-test-module-mocks` 플래그가
  필요한데, `node-test` 실행기는 고정된 `node --test <file>` 형태라 이 플래그를 붙일
  방법이 없다(harness 제약, 기존 24개 프론트 테스트 파일도 같은 제약을 이미 받는다).
  대신 `npm test --prefix frontend`(package.json의 `test` 스크립트가 이 플래그를
  포함)로 실행했다.
- `npm test --prefix frontend`(프론트 전체, package.json test 스크립트가
  `--experimental-test-module-mocks` 포함) — **1,248 pass / 0 fail / 0 skipped**. 신규
  `economy.store.test.js`(7개) 포함, `profileCustomization.store.test.js`·
  `skinCardWear.store.test.js` 기존 8개 회귀 없음.
- `npm run build --prefix frontend` — production build **exit 0**(경고: 메인 청크가
  500KB 초과 — 이 슬라이스 이전부터 있던 번들 구성, 범위 밖이라 손대지 않음).
- `node impl-check.js test`/`node impl-check.js build`(레포 루트) — 루트
  `package.json`의 `test`/`build` 스크립트가 각각 `exit 1` 스텁·정의 없음이라(이
  슬라이스 이전부터 있던 상태, `test:game-core`만 `--prefix backend`로 위임) 그대로
  실행하면 항상 실패한다 — 이 슬라이스가 만든 결함이 아니라서 고치지 않았고, 대신 위
  `npm test --prefix backend`/`--prefix frontend`로 각 패키지를 직접 확인했다.

## 미검증 항목 (readiness_unverified)

- **AC-01/AC-02/AC-03을 실제 MySQL `SELECT ... FOR UPDATE` 행 잠금·UNIQUE 제약 위에서
  검증** — `backend/tests/db/f08-economy.integration.test.js`가 이 목적으로 존재하지만
  `F08_TEST_DATABASE_URL`이 없어 이 세션에서는 skip됐다. 이 호스트에 mysql:8.4
  컨테이너(`jokertest-db-1`, `docker ps`로 실행 중 확인)가 떠 있지만, 그 컨테이너에
  전용 테스트 DB(`pluto_f08_economy_test`)를 만들기 위한 `docker exec`/`node -e` 실행이
  이 세션의 명령 승인 절차에서 거부됐다("This command requires approval") — 형태를
  바꿔 우회하지 않았다. 운영자 또는 정규 VERIFY 단계가 `F08_TEST_DATABASE_URL`을 그
  DB(또는 별도 전용 DB)로 채워 재실행해야 한다.
- **실제 브라우저에서 상점/마이페이지 화면이 `/economy/*` API를 실제로 호출하는지** —
  이 슬라이스는 데이터 계층(`economy.store.js`)만 만들었고 화면 연결은 범위 밖이라
  브라우저 검증 대상이 아직 없다.

## 복구 절차

아래 파일만 고쳤다(전부 이번 회차 신규 또는 최소 배선) — 롤백이 필요하면 이 목록을
지우거나 이전 커밋으로 되돌리면 된다. 기존 테이블 스키마 변경은 없다(신규
`economy_wallets`/`economy_ledger_entries`/`economy_entitlements`/`economy_loadouts`
4개 테이블만 추가).

- `backend/economy/catalog.js` (신규)
- `backend/models/economy/economy.model.js` (신규)
- `backend/service/economy.service.js` (신규)
- `backend/service/economy.service.test.js` (신규)
- `backend/routes/economy.routes.js` (신규)
- `backend/__tests__/economy.route.test.js` (신규)
- `backend/tests/db/f08-economy.integration.test.js` (신규)
- `backend/index.js` (economy 라우터 마운트 2줄)
- `backend/__tests__/schema.existingTables.test.js` (`NEW_MODELS`에 `EconomyLedgerEntry`
  추가)
- `frontend/src/domains/economy/store/economy.store.js` (신규)
- `frontend/src/domains/economy/store/__tests__/economy.store.test.js` (신규)
- `docs/requirements/2026-09-09-f08-economy-evidence.md` (본 문서, 신규)
