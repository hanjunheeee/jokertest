# F-08 지갑·거래·카탈로그·소유권 — 이관·복구·검증 기록

## 최종 운영자 검증 — 2026-09-11 KST

Pluto AS의 최종 구현 `535c06d797289a1c936de0cb975df9371cddcbf3`는 CODEX-3의
6개 인수 조건 PASS와 교차 검증 PASS를 거쳐 `bdefdd2d5fb00aca2f227f3ceb2261b643edee33`로
병합됐다. 정상 검증은 프론트 1,254개 통과, 빌드 exit 0, 실제 격리 MySQL을 포함한
백엔드 1,260개 통과(실패·건너뜀 0)다. 아래 회차별 단위 시험·건너뜀 기록은 과거 이력이다.

병합 후 운영자 점검에서 남아 있던 다음 문제를 추가 수정했다.

- 실제 배포 CLI에서 빠졌던 `0005-add-social-auth`를 등록해 0001~0006을 순서대로 적용한다.
  F08 실제 DB 통합 시험도 이 CLI의 목록을 직접 사용한다. 기존 마이그레이션 파일은 변경하지 않았다.
- 기존 계정 이관에서 실패한 계정을 재개 시 건너뛰지 않도록 체크포인트를 최초 실패 이전의
  연속 성공 구간에 고정했다. 다른 정상 계정은 계속 처리하며 조회 위치와 재개 위치를 구분해 출력한다.
  첫 계정/중간 계정 실패 후 중단·재개를 시험해 지급 누락과 중복이 없음을 확인했다.
- F08 통합 시험은 DB 설정이 있는데 연결에 실패하면 시험을 실패 처리한다. DB 미설정만 건너뛴다.

수정 후 백엔드 전체를 같은 격리 DB에서 다시 실행해 **1,262개 통과, 실패·건너뜀 0**을 확인했다.
앞선 정상 VERIFY-15 실행 후 남은 테이블을 수동 삭제하지 않은 상태에서 재실행했으므로,
기존 F01~F07 시험이 F08 테이블을 모르는 테이블로 오판했던 반복 실행 문제도 재발하지 않았다.
근거: `.pluto/slices/AS/runs/VERIFY-13.json`~`VERIFY-15.json`, `CODEX-3.json`,
`.pluto/monitor/AS-postmerge-backend-20260911.log`, `.pluto/monitor/AS-completion-20260911.json`.

검증 범위는 서버·DB·프론트 상태 저장소다. 상점 화면의 실제 구매 연결과 프로필 편집 화면은
후속 F09/F13 작업이며, F08 브라우저 화면 검증 완료를 주장하지 않는다. 운영 DB 이관 명령은 실행하지 않았다.
운영자 추가 수정은 위 테스트 근거로 기록하며 앞선 CODEX-3 심사가 이 추가 diff까지 심사했다고 간주하지 않는다.

날짜: 2026-09-09 최초 작성, 2026-09-10 R-IMPL(반송) 대응으로 갱신, 2026-09-10 CODEX-1
재검토(AC-03/AC-04 미해결 partial) 대응으로 추가 갱신, 2026-09-10 CODEX-2 재검토
(AC-03/AC-04 다시 미해결/partial) 대응으로 추가 갱신
슬라이스: Pluto AS (F-08)

이 문서는 네 회차를 함께 기록한다: (1) 최초 구현 — 계획의 "새로 만들 것" 6개 모듈을
신규로 구현, (2) R-IMPL 반송 대응(2026-09-10) — 운영자가 정확한 커밋(`2d7c3976`)과
파일 4개의 스코프 플래그 14개를 검토한 뒤 지적한 실질적 결함을 수정, (3) CODEX-1
재검토 대응(2026-09-10) — 독립 검토가 AC-03·AC-04를 "미해결/partial"로 남긴 구체적
결함 2건을 추가로 수정, (4) CODEX-2 재검토 대응(2026-09-10) — CODEX-1 대응이 "지연
지급 확장"과 "카탈로그 값으로 amount 대체"로만 고쳐, 사람이 다시 "lazy grant on
wallet/equip is NOT signup/backfill"·"silently ignoring tampered fields is NOT
rejecting tampered requests"로 반려한 것을 실제 가입/이관 훅과 실제 400 거부로
고쳤다. 아래 "CODEX-2 재검토 대응"절이 이번 회차에 실제로 바뀐 내용이고, 그 이전
절들은 이전 회차 기록을 그대로 보존한다.

## CODEX-2 재검토 대응(2026-09-10) — 무엇을 왜 고쳤는가

CODEX-2.json이 남긴 두 미해결 지적과, 그 뒤에 이어진 사람의 명시적 교정 기록
("Bounded operator correction after actual VERIFY-10 and CODEX-2")을 함께 대응했다.

1. **AC-03 partial(가입·기존 계정 이관 연결 근거 없음, 재반려)** — CODEX-1 대응은
   `equipItem` 맨 앞에서 `ensureDefaultEntitlements`를 호출하도록 확장했을 뿐, 실제
   가입 경로(`authService.signup`·`socialAuthService.completeSocialSignup`)나 별도
   백필 절차를 전혀 만들지 않았다 — "지갑/장착 조회 시점의 지연 지급"은 "가입 시 지급"이
   아니라는 것이 이번 지적의 핵심이다(교정 기록: "lazy grant on wallet/equip is NOT
   signup/backfill"). 지금은:
   - `economy.service.js`의 `applyLedgerTransaction`/`ensureWalletRow`/
     `ensureDefaultLoadout`/`ensureDefaultEntitlements`가 모두 선택적
     `{ transaction }`(부모 트랜잭션)을 받도록 확장됐다 — 신규 가입은 계정 생성
     트랜잭션 안에서 이미 열려 있는 트랜잭션을 그대로 재사용해야 한다(그 트랜잭션
     밖에서 새 트랜잭션을 열면 아직 커밋되지 않은 신규 `user.uuid`를 다른 커넥션이
     보지 못해 FK 제약에 걸리거나, 부모가 실패해도 이미 커밋되어 원자성이 깨진다).
   - `auth.service.js`의 `signup()`과 `socialAuth.service.js`의
     `completeSocialSignup()`이 각자의 `userRepository.withTransaction` 콜백 안에서
     `economyService.ensureDefaultEntitlements(user.uuid, db, { transaction })`을
     직접 호출한다 — 계정이 커밋되는 순간 기본 지급도 이미 끝나 있다. 지급이 실패하면
     (트랜잭션 안에서 던지므로) 계정 생성 자체도 함께 롤백되어, 필수 지급 없는 반쪽
     계정이 남지 않는다(`f08-economy.integration.test.js`의 "가입 트랜잭션 실패는
     기본 지급까지 함께 롤백한다" 시험으로 직접 확인).
   - 이 슬라이스 이전에 이미 만들어진 기존 계정(가입 훅을 거친 적 없는 계정)을 위해
     `backend/db/backfillEconomy.js`(신규, `backfillDefaultEntitlements`)와
     `backend/db/backfillEconomy.cli.js`(신규, `run --confirm` 진입점)를 추가했다.
     uuid 오름차순 배치(기본 200건)로 처리하고, 배치마다 마지막 uuid를 체크포인트로
     보고해(호출부가 기록해 두면 `--start-after-uuid`로 재개 가능) 중단 후 재개할 수
     있다. `ensureDefaultEntitlements` 자체가 멱등이라 같은 계정을 재시도해도 중복
     지급되지 않으므로(재시도 안전), 한 계정이 실패해도 배치 전체를 막지 않고
     failures로 모아 계속 진행한다. `backend/index.js`나 다른 어떤 기동 경로도 이
     CLI를 자동 호출하지 않는다("Do not automatically run production backfill or
     arbitrary startup sync") — 사람이 명시적으로 `node backend/db/
     backfillEconomy.cli.js run --confirm`을 실행해야 하고, 이 세션에서는 격리 테스트
     DB에서도 실행하지 않았다(단위 시험만 통과시켰다, 아래 "실행한 검증" 참고).
   - `equipItem` 맨 앞의 지연 지급(CODEX-1 대응)은 그대로 유지했다 — 신규/기존 계정
     모두 지금은 가입/백필에서 이미 지급이 끝나 있어야 하지만, 어떤 이유로든(예:
     백필이 아직 완료되지 않은 과도기) 아직 못 받은 계정이 `equip`부터 호출해도
     `ITEM_NOT_OWNED`로 잘못 거부되지 않도록 하는 방어선으로 남겨뒀다 — 이제는 "가입/
     백필을 대신하는 유일한 지급 경로"가 아니라 "보조 방어선"이라는 점이 이전 회차와
     다르다.
   - `backend/tests/helpers/isolatedTestDb.js`의 `buildManagedSchema`가 이제
     `0006-add-economy` 마이그레이션을 직접 `require`해 economy_* 4개 테이블을
     **기본으로** 관리 목록에 포함한다(이전에는 선택 인자 `addEconomy`를 호출부가
     일일이 넘겨야 했는데, f08 스위트만 그렇게 고쳐지고 f01~f03/f05/f07/
     `user.accountPaths.test.js`는 고쳐지지 않았다 — VERIFY-10과 같은 근본 원인이
     재발할 뻔했다). `f02-signup.integration.test.js`(`authService.signup`을 실제로
     반복 호출)·`f05-social-auth.integration.test.js`·
     `f07-discord-oauth.integration.test.js`(둘 다 `completeSocialSignup`을 실제로
     호출)의 `MIGRATIONS` 배열에도 `0006-add-economy`를 추가해, 그 스위트들의 실제
     가입 호출이 economy_* 테이블 부재로 실패하지 않게 했다.
2. **AC-04 partial(변조 요청이 여전히 201로 성공, 재반려)** — CODEX-1 대응은
   `/economy/admin/grant`가 `amount`·`currency` 대신 `reason`(카탈로그 키)만 읽게
   했지만, `economy.route.test.js`는 여전히 `amount`/`currency`/`price`/`balance`
   같은 필드를 **함께** 보내도 그 값이 "무시되고" 201로 성공하기를 기대했다 — 교정
   기록의 핵심 지적대로 "무시"는 "거부"가 아니다. 지금은:
   - `/economy/purchase`와 `/economy/admin/grant` 둘 다 문서화된 필드
     (`itemId`/`referenceEventId`, `userId`/`reason`/`referenceEventId`) 밖의 키가
     하나라도 있으면 서비스를 호출하기 전에 `400`(`UNKNOWN_PURCHASE_FIELD`/
     `UNKNOWN_GRANT_FIELD`)으로 거부한다(`Object.keys`로 자체 열거 가능 속성만
     검사 — own-property 안전). `price`·`priceGold`·`priceAmount`·`balance`·
     `balanceGold`·`balanceDiamond`·`amount`·`currency`·임의의 알 수 없는 필드
     전부 이 경로로 거부되고, 서비스는 한 번도 호출되지 않는다(`economy.route.test.js`가
     각 필드별로 반복 검증).
   - `backend/economy/catalog.js`의 `getRewardCatalogEntry`가 `REWARD_CATALOG[reason]`
     직접 접근 대신 `hasOwnProperty` 확인을 거친다 — `reason: "toString"`/
     `"constructor"`/`"__proto__"`처럼 `Object.prototype`에서 우연히 값이 발견되는
     키가 유효한 보상 사유로 오인되지 않는다(own-property safe catalog lookup,
     `economy.route.test.js`에 회귀 시험 추가).
   - 문서화된 필드만 보낸 정상 요청(변조 없음)은 여전히 서버 카탈로그 가격/보상량으로
     성공한다(positive control 시험 유지·추가).

이번 회차는 프론트(`.jsx`/`economy.store.js`) 파일을 건드리지 않았다 — CODEX-2
지적은 모두 백엔드(가입/소셜가입/백필/라우트/카탈로그) 범위였다.

## CODEX-1 재검토 대응(2026-09-10) — 무엇을 왜 고쳤는가

독립 검토(CODEX-1.json)가 남긴 두 미해결 지적을 대응했다:

1. **AC-03 partial ①(read-then-blind-write 경쟁 상태)** — `ensureDefaultLoadout`이
   `findOrCreate`로 읽은 loadout 인스턴스가 두 컬럼 모두 `null`이면 그 스냅샷을 근거로
   `instance.update(patch)`를 무조건 실행했다. 실제 Sequelize의 `findOrCreate`가 돌려주는
   인스턴스는 조회 시점의 분리된(disconnected) 스냅샷이라, 그 읽기와 쓰기 사이에 동시
   `equipItem` 요청이 같은 컬럼에 유효한 선택을 먼저 커밋해도 스냅샷에는 반영되지
   않는다 — 그 뒤 무조건 `update(patch)`가 실행되면 방금 커밋된 유효 선택을 기본값으로
   되돌려 덮어썼다. 지금은 컬럼별로 `EconomyLoadout.update(patch, {where: {user_id,
   해당컬럼: null}})` 형태의 모델 수준 조건부 UPDATE로 바꿨다 — WHERE 절 자체에 "지금도
   null인지"를 실어 단일 SQL 문으로 원자적으로 판정하므로, 그 사이 다른 트랜잭션이 이미
   값을 넣었으면 0행에 적용되어 그 값을 그대로 둔다. `economy.service.test.js`의 fake
   `EconomyLoadout`도 canonical 저장소와 "그 시점 스냅샷"을 분리하도록 다시 만들어(이전
   fake는 같은 객체 참조를 그대로 돌려줘 이 경쟁 상태 자체를 재현할 수 없었다), 새 회귀
   시험이 구버전 코드에서는 실패하고 신버전에서는 통과함을 직접 확인했다.
2. **AC-03 partial ②(가입·기존 계정 이관 연결 근거 없음)** — 기본 지급은
   `getWalletSummary`(지갑/소유품 조회 GET) 경로에서만 보장됐다 — 그 경로를 한 번도
   거치지 않고 곧바로 `equipItem`부터 호출하면(신규 가입 직후 상점을 열지 않고 바로
   기본 프로필을 장착하려는 클라이언트, 또는 별도 가입 훅 없이 이관된 기존 계정의 첫
   접근) 아직 어떤 기본 항목도 실제로 보유하지 않은 상태라 `ITEM_NOT_OWNED`로 잘못
   거부됐다. 별도의 가입 훅을 추가하는 대신(계획대로 훅 없는 지연 지급 설계를
   유지하되), `equipItem`도 "계정이 경제 시스템을 처음 건드리는 지점"이 될 수 있다는
   전제로 함수 맨 앞에서 `ensureDefaultEntitlements`를 호출하도록 확장했다(멱등하므로
   반복 호출해도 안전). 이제 신규 가입이든 이관된 기존 계정이든, `wallet` GET·`equip`
   POST 어느 쪽을 먼저 호출해도 AC-03 보장이 동일하게 성립한다.
3. **AC-04 partial(관리자 지급 경로가 클라이언트 amount·currency를 그대로 신뢰)** —
   `purchaseItem`은 서버 카탈로그 가격만 쓰지만, `/economy/admin/grant`와
   `grantReward`는 요청 본문의 `amount`·`currency`를 범위 검사(`isBoundedAmount`)만
   거쳐 그대로 지급했다 — 인증된 QA/ADMIN 요청이라 해도 그 값은 여전히 "클라이언트가
   보낸 값"이라, 서버 저장값과 대조하지 않는 한 AC-04("클라이언트가 전송한 …보상량 값을
   서버가 그대로 신뢰하지 않고 서버 저장값 기준으로 검증")를 만족하지 못한다. 지금은
   `backend/economy/catalog.js`에 `REWARD_CATALOG`(사유→`{currency, amount}` 고정값)를
   추가하고, `/economy/admin/grant`는 요청 본문에서 `amount`·`currency`를 아예 읽지
   않는다 — `reason`이 이 카탈로그의 키여야 하고, 실제 지급 금액·재화는 항상 카탈로그
   값이다(`purchaseItem`이 `itemId`로 카탈로그 가격을 찾는 것과 같은 패턴). 카탈로그에
   없는 `reason`은 `UNKNOWN_REWARD_REASON`(400)으로 거부되고 `grantReward`가 아예
   호출되지 않는다. `economyService.grantReward` 자체의 시그니처(임의 `amount`를 받는
   저수준 함수)는 그대로 뒀다 — 이 함수는 신뢰된 서버 내부 호출(테스트 시딩,
   `ensureDefaultEntitlements` 등)이 여전히 정당하게 쓰는 범용 원장 적용 도구이고,
   실제 보안 경계는 "클라이언트 요청이 도달하는 라우트"이므로 그 경계(`/admin/grant`)만
   카탈로그로 봉쇄했다. `economy.route.test.js`의 관리자 지급 테스트를 `reason` 기반
   계약으로 갱신하고, 클라이언트가 카탈로그와 다른 `amount`/`currency`를 함께 보내도
   무시된다는 것과 알 수 없는 `reason`이 거부된다는 것을 각각 새 테스트로 고정했다.

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
- `backend/db/backfillEconomy.js`(신규, CODEX-2) — 기존 계정 기본 지급 백필. 배치·
  체크포인트·재시도 안전.
- `backend/db/backfillEconomy.cli.js`(신규, CODEX-2) — 위 백필의 명시적 CLI 진입점
  (`run --confirm`). 어떤 기동 경로도 자동 호출하지 않는다.
- `backend/db/backfillEconomy.test.js`(신규, CODEX-2) — 배치/체크포인트/재개/멱등/
  재시도-후-성공/영구실패-후-failures 계약을 fake db로 검증.
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
  검증한다. A-04(기존 유효 선택 보존)도 별도 테스트로 고정했다. **(CODEX-1)** 조건부
  갱신이 스냅샷을 읽은 뒤·쓰기 전 사이에 커밋된 동시 `equip` 결과를 덮어쓰지 않는다는
  것과, 지갑 조회 없이 곧바로 기본 프로필을 장착해도(자동 기본 지급 후) 성공한다는 것을
  각각 새 단위 시험으로 고정했다. DB 통합 시험이 신규 계정 지급 시나리오와 "지갑 조회
  없이 곧바로 장착" 시나리오를 실제 MySQL로 재확인한다.
- **AC-04(서버 가격·보상량 신뢰)** — 라우트는 요청 본문에서 `itemId`·
  `referenceEventId`만 읽는다. 서비스 시험은 카탈로그 가격 기준 잔액 부족 거부,
  카탈로그에 없거나 구매 불가한 itemId 거부, **DIAMOND 지급이 GOLD 잔액을 바꾸지
  않음**, **안전 정수 범위를 벗어난 금액은 지갑을 건드리기 전에 거부**(오버플로 방지),
  **알 수 없는 재화 거부**를 확인한다. **(CODEX-1)** 관리자 지급 경로(`/economy/admin/
  grant`)는 더 이상 요청 본문의 `amount`·`currency`를 읽지 않고 `reason`을
  `REWARD_CATALOG`에서 조회한 고정값만 쓴다 — `economy.route.test.js`가 클라이언트가
  카탈로그와 다른 `amount`/`currency`를 함께 보내도 무시된다는 것과, 카탈로그에 없는
  `reason`은 `UNKNOWN_REWARD_REASON`(400)으로 거부되고 `grantReward`가 호출조차 되지
  않는다는 것을 검증한다.
- **AC-05(소유권·종류 검증)** — 서비스 시험 3건(미보유 거부 403·임의 문자열 거부 400·
  슬롯-종류 불일치 거부 400) + 정상 보유 시 성공 1건. 라우트 시험은 서비스가 던진
  코드가 그대로 HTTP 상태로 나가는지 확인한다.
- **AC-06(계정 간 접근 차단, R-IMPL로 범위 확장)** — `economy.route.test.js`: 쿠키
  없음 401, 다른 계정 `:userId` 조회 403(`ECONOMY_FORBIDDEN`), 본인 조회 200(GOLD·
  DIAMOND 둘 다 포함). **관리자 전용 지급 경로는 토큰 클레임이 아니라 실제 계정 행의
  role로 판정된다**(토큰은 QA인데 실제 계정은 USER인 경우 거부, 반대도 검증). 크로스
  계정 참조 사건 ID 재사용이 서로의 원장에 영향을 주지 않는다는 것은 위 AC-02와 함께
  검증한다.

## 실행한 검증(CODEX-2 재검토 대응, 2026-09-10)

- `node impl-check.js node-test backend/service/economy.service.test.js` — **24 pass /
  0 fail**(21 → 24, 부모 트랜잭션 재사용·롤백·`ensureDefaultEntitlements` 부모 트랜잭션
  threading 회귀 3건 추가).
- `node impl-check.js node-test backend/__tests__/economy.route.test.js` — **17 pass /
  0 fail**(14 → 17, 구매/관리자 지급 알 수 없는 필드 400 거부·own-property safe
  reason 거부 3건 추가, 기존 "변조 무시" 계열 시험 2건은 400 기대로 재작성).
- `node impl-check.js node-test backend/__tests__/economy.migration.test.js` — **5 pass
  / 0 fail**(변경 없음, 회귀 확인).
- `node impl-check.js node-test backend/db/backfillEconomy.test.js`(신규) — **7 pass /
  0 fail**(배치·체크포인트/재개·멱등·재시도-후-성공·영구실패-격리·빈-결과·기본값
  노출).
- `node impl-check.js node-test backend/__tests__/auth.signup.rollback.test.js` —
  **4 pass / 0 fail**(기존 3건 + 가입 성공 시 기본 지급 17종/기본 선택 검증 추가,
  단독 실행을 위한 `DATABASE_URL` 자리표시자도 이번에 추가).
- `node impl-check.js node-test backend/__tests__/socialAuth.service.test.js` —
  **4 pass / 0 fail**(변경 없음, `completeSocialSignup`을 직접 호출하지 않는 스위트라
  영향 없음을 재확인).
- `node impl-check.js node-test backend/__tests__/isolatedTestDb.guard.test.js` —
  **10 pass / 0 fail**(`buildManagedSchema`의 economy 테이블 기본 포함이 기존 계약을
  그대로 유지함을 재확인 — 관리 목록에 4개 테이블이 늘어도 `existingTables`에 없으면
  drop이 호출되지 않으므로 기존 `dropCalls` 단언이 그대로 통과한다).
- `node impl-check.js node-test backend/tests/db/f08-economy.integration.test.js` —
  **0 pass / 0 fail / 15 skipped**(11 → 15, 신규 가입/소셜 가입 완료/가입 트랜잭션
  롤백/기존 계정 백필 4건 추가. `F01_TEST_DATABASE_URL` 미설정 — 미검증, 아래 참고).
- `npm test --prefix backend`(백엔드 전체) — **1,202 pass / 0 fail / 58 skipped**
  (1,189→1,202 pass, 54→58 skipped, 위 신규 시험 반영). skip은 전부
  `F01_TEST_DATABASE_URL` 미설정에 의한 기존 관례.
- `npm test --prefix frontend`(프론트 전체) — **1,254 pass / 0 fail / 0 skipped**(이번
  회차도 프론트 파일을 건드리지 않았다 — 회귀 없음 확인용 재실행).
- `npm run build --prefix frontend` — production build **exit 0**(경고: 메인 청크
  500KB 초과 — 이 슬라이스 이전부터 있던 번들 구성, 범위 밖, 변경 없음).
- `node impl-check.js test`(레포 루트) — 이전 회차와 동일하게 루트 `package.json`의
  스텁 `test` 스크립트(`echo "Error: no test specified" && exit 1`)라 `exit 1`이다
  (이 슬라이스 이전부터 있던 상태, 이번에도 재확인만 했다) — 위
  `npm test --prefix backend`/`--prefix frontend`로 대체 확인.

## 미검증 항목(readiness_unverified)

- **AC-01/AC-02/AC-03/AC-06을 실제 MySQL 행 잠금·복합 유일 인덱스·트랜잭션 롤백
  위에서 검증, 그리고 이번에 추가된 실제 가입/소셜 가입 완료/가입 롤백/기존 계정
  백필 4건** — `backend/tests/db/f08-economy.integration.test.js`가 f01~f07과 같은
  `F01_TEST_DATABASE_URL`을 기다리지만 이 세션에는 설정돼 있지 않아 skip됐다. 이
  세션의 명령 승인 절차상 Docker exec/DB 리셋을 직접 실행할 수 없다(운영자 지시: 이
  파일 밖에서 별도 DB를 만들거나 조작하지 말 것) — 로컬에서 실행이 거부된 것이 DB
  자체의 부재를 뜻하지 않는다. 운영자 또는 정규 VERIFY 단계가
  `F01_TEST_DATABASE_URL`을 채워 재실행해야 한다. 같은 이유로
  `backend/db/backfillEconomy.cli.js`도 격리 테스트 DB 위에서 실제로 실행해 본 적은
  없다(단위 시험만 통과, 위 참고) — 운영 DB에는 더더욱 실행하지 않았다.
- **실제 브라우저에서 상점/마이페이지 화면이 `/economy/*` API를 실제로 호출하는지** —
  데이터 계층만 만들었고 화면 연결은 범위 밖이라 브라우저 검증 대상이 아직 없다.
- **운영 배포에서 `backend/db/backfillEconomy.cli.js run --confirm`을 실제로 실행하는
  절차 자체** — 이 세션은 그 CLI를 만들고 격리 DB 없이 단위 시험만 통과시켰을 뿐,
  실제 운영/스테이징 DB에 대한 백필 실행은 하지 않았다(교정 기록: "Do not
  automatically run production backfill" — 자동 실행은 물론 이 세션에서의 수동 실행도
  하지 않았다). 배포 담당자가 `F01_TEST_DATABASE_URL` 등 격리 DB에서 먼저 시험
  실행한 뒤 운영 DB에 적용해야 한다.

## 복구 절차

아래 목록이 이번 회차까지 이 슬라이스가 고친 전체 파일이다 — 롤백이 필요하면 이
목록을 지우거나 이전 커밋으로 되돌리면 된다. 기존 테이블 스키마 변경은 없다(신규
`economy_wallets`/`economy_ledger_entries`/`economy_entitlements`/`economy_loadouts`
4개 테이블만 추가, 이제 `0006-add-economy.js` 마이그레이션으로 관리됨).

- `backend/economy/catalog.js`(CODEX-2: `getRewardCatalogEntry` own-property safe화)
- `backend/models/economy/economy.model.js`
- `backend/db/migrations/0006-add-economy.js`(신규, R-IMPL)
- `backend/service/economy.service.js`(CODEX-2: 부모 트랜잭션 재사용 지원)
- `backend/service/economy.service.test.js`(CODEX-2: 부모 트랜잭션 재사용 회귀 3건)
- `backend/routes/economy.routes.js`(CODEX-2: 알 수 없는 필드 400 거부)
- `backend/__tests__/economy.route.test.js`(CODEX-2: 알 수 없는 필드 거부·own-property
  safe reason 거부 시험으로 갱신)
- `backend/__tests__/economy.migration.test.js`(신규, R-IMPL)
- `backend/db/backfillEconomy.js`(신규, CODEX-2)
- `backend/db/backfillEconomy.cli.js`(신규, CODEX-2)
- `backend/db/backfillEconomy.test.js`(신규, CODEX-2)
- `backend/service/auth.service.js`(CODEX-2: `signup()`이 가입 트랜잭션 안에서 기본
  지급을 호출)
- `backend/service/socialAuth.service.js`(CODEX-2: `completeSocialSignup()`이 가입
  트랜잭션 안에서 기본 지급을 호출)
- `backend/__tests__/auth.signup.rollback.test.js`(CODEX-2: economy fake 모델 추가,
  기본 지급 검증 추가, 단독 실행용 `DATABASE_URL` 자리표시자 추가)
- `backend/tests/db/f08-economy.integration.test.js`(CODEX-2: 실제 가입/소셜 가입
  완료/가입 롤백/기존 계정 백필 4건 추가)
- `backend/tests/db/f02-signup.integration.test.js`(CODEX-2: `0006-add-economy`를
  `MIGRATIONS`에 추가 — `authService.signup` 실호출이 economy 테이블을 필요로 함)
- `backend/tests/db/f05-social-auth.integration.test.js`(CODEX-2: 동일 이유로
  `0006-add-economy` 추가)
- `backend/tests/db/f07-discord-oauth.integration.test.js`(CODEX-2: 동일 이유로
  `0006-add-economy` 추가)
- `backend/tests/helpers/isolatedTestDb.js`(R-IMPL: `addEconomy` 선택 인자 추가 →
  CODEX-2: economy 테이블을 기본으로 포함하도록 중앙화, 호출부마다 넘길 필요 없음)
- `backend/scripts/migrate-db.js`(CODEX-2: 실제 배포 마이그레이션 목록에
  `0006-add-economy` 추가 — 0005-add-social-auth는 이 슬라이스 이전부터 이 목록에
  없던 별도 이슈로, 범위 밖으로 남겨뒀다)
- `backend/index.js`(economy 라우터 마운트 2줄)
- `backend/__tests__/schema.existingTables.test.js`(`NEW_MODELS`에 `EconomyLedgerEntry`
  추가)
- `frontend/src/domains/economy/store/economy.store.js`
- `frontend/src/domains/economy/store/__tests__/economy.store.test.js`
- `docs/requirements/2026-09-09-f08-economy-evidence.md`(본 문서)
