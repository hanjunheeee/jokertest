'use strict';

// F-08 지갑·거래·카탈로그·소유권 서비스. 구매·기본 지급·QA/보상 지급을 모두 같은
// applyLedgerTransaction 하나로 처리해 지갑 잔액과 거래 원장 합계가 항상 같게 만든다
// (AC-01). db는 concurrency.service.js와 같은 방식으로 테스트가 주입할 수 있게
// 마지막 인자로 받는다 — 기본값은 실제 backend/models다.
//
// 동시성(AC-01): purchaseItem은 지갑 행을 SELECT ... FOR UPDATE로 잠근 뒤에야 이미
// 보유 중인지 확인한다. 그래서 같은 계정으로 동시에 두 번 구매 요청이 들어와도(서로 다른
// 브라우저 = 서로 다른 referenceEventId) 두 번째 요청은 첫 번째 커밋이 끝나 잠금이
// 풀린 뒤에야 진행되고, 그 시점엔 이미 소유 중이라는 것을 보고 즉시 거부된다 — 잠금보다
// 먼저 소유 여부를 확인하면 이 보장이 깨진다.
//
// 재처리 방지(AC-02)/계정 격리(AC-06) — R-IMPL(2026-09-10) 반송 수정:
// 이전 버전은 reference_event_id만으로(계정 무관) 전역 조회해 기존 원장 행을 그대로
// 돌려줬다. 그러면 (a) 다른 계정이 남의 참조 사건 ID를 그대로 제출하면 그 계정의 원장
// 행을 조회해 돌려받고(계정 간 정보 노출, AC-06 위반), (b) 같은 계정이 같은 키를 다른
// 내용(다른 상품·다른 금액)으로 재전송해도 예전 결과를 "성공"으로 잘못 돌려줬다. 지금은
// (user_id, reference_event_id) 조합으로만 조회·유일 제약을 걸고, 기존 행을 찾으면 반드시
// 지금 요청과 같은 조작(reason·itemId·currency·amount)인지 확인한다 — 같은 계정이 같은
// 키를 다른 내용으로 재사용하면 이전 결과를 노출하지 않고 일반화된 409로 거부한다(payload
// mismatch, no disclosure). 다른 계정이 같은 키 문자열을 쓰는 것은 애초에 "재사용"이 아니라
// 완전히 독립된 요청으로 취급된다(조회 자체가 계정 범위이므로).
//
// 이 재확인은 지갑 잠금을 잡은 "뒤에", 소유 여부·잔액 검증보다 "먼저" 한 번 더 실행된다
// (recheck-after-lock). 그래야 동시에 들어온 같은 키 재시도가 서로 경합해도, 늦게 잠금을
// 얻은 쪽은 소유권/잔액을 다시 따지지 않고 먼저 커밋된 원래 결과를 그대로 돌려받는다 —
// 순서가 반대(소유권 검사가 먼저)면 늦은 쪽이 "이미 보유함"으로 잘못 거부될 수 있다.

// F-09 CODEX-2 재검토(AC-03) 대응: getCatalogItem만은 구조 분해로 캡처하지 않고 catalog
// 모듈 객체를 통해서만 호출한다(catalog.getCatalogItem(...)) — 구조 분해로 지역 변수에
// 캡처하면 그 값은 require 시점의 함수 참조로 고정되어, 시험이 나중에
// catalogModule.getCatalogItem = fn으로 몽키패치해도 이 파일은 여전히 원래 함수를 쓴다.
// AC-03(혼합 재화)은 "운영 가격 데이터를 변경하지 않고" 격리된 시험용 상품(DIAMOND 가격)을
// 검증해야 하므로, catalog.js의 ALL_ITEMS에 실제 항목을 추가하는 대신 시험이 이 함수를
// 일시적으로 교체할 수 있어야 한다 — 프로퍼티 접근(catalog.getCatalogItem)이라야 그 교체가
// 이 파일에도 실제로 반영된다.
const catalog = require('../economy/catalog');
const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;
const { createError } = require('../utils/appError');

const FREE_CARD_FRAME_ID = 'player-card-베이스';

// F-08 요구사항: GOLD·DIAMOND 두 재화 모두 정수 잔액을 갖는다(초기값 0/0). 현재 구매
// 가능한 코스메틱은 모두 GOLD로만 판매한다(현금 충전·재화 패키지 판매는 이 슬라이스
// 범위 밖) — purchaseItem은 항상 CURRENCIES.GOLD로 applyLedgerTransaction을 호출한다.
const CURRENCIES = Object.freeze({ GOLD: 'GOLD', DIAMOND: 'DIAMOND' });

const CURRENCY_TO_WALLET_COLUMN = Object.freeze({
    GOLD: 'balance_gold',
    DIAMOND: 'balance_diamond',
});

// MySQL INTEGER(부호 있는 32비트, 최대 약 21억)의 실제 컬럼 범위보다 충분히 작게 잡아,
// 잔액 갱신(currentBalance + amount)이 오버플로되지 않게 두 번 확인한다: 요청 자체의
// amount가 이 범위를 벗어나면 지갑을 건드리기 전에 즉시 거부하고, 갱신 후 잔액도 이
// 범위를 넘으면 마찬가지로 거부한다.
const MAX_BALANCE = 1_000_000_000;

const isValidCurrency = (currency) => Object.prototype.hasOwnProperty.call(CURRENCY_TO_WALLET_COLUMN, currency);
const isBoundedAmount = (amount) => Number.isInteger(amount) && Number.isSafeInteger(amount) && Math.abs(amount) <= MAX_BALANCE;

const SLOT_TO_ITEM_TYPE = {
    PROFILE_PHOTO: ITEM_TYPES.PROFILE_PHOTO,
    PROFILE_BORDER: ITEM_TYPES.PROFILE_BORDER,
    PLAYER_CARD_FRAME: ITEM_TYPES.PLAYER_CARD_FRAME,
};

const SLOT_TO_LOADOUT_COLUMN = {
    PROFILE_PHOTO: 'selected_profile_photo_id',
    PROFILE_BORDER: 'selected_profile_border_id',
    PLAYER_CARD_FRAME: 'selected_card_frame_id',
};

const economyModels = (db) => ({
    sequelize: db.sequelize,
    EconomyWallet: db.sequelize.models.EconomyWallet,
    EconomyLedgerEntry: db.EconomyLedgerEntry,
    EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
    EconomyLoadout: db.sequelize.models.EconomyLoadout,
    EconomyPurchaseRequest: db.sequelize.models.EconomyPurchaseRequest,
});

const defaultDb = () => require('../models');

/** 지갑 행이 없으면 두 재화 모두 잔액 0으로 만들어 둔다 — 독립 호출(잠금 트랜잭션 밖)에서는
 *  미리 실행해 잠금 트랜잭션 안에서는 항상 SELECT ... FOR UPDATE만 하면 되게 한다.
 *
 *  CODEX-2(AC-03) 대응: 신규 가입처럼 부모 트랜잭션(externalTransaction)이 주어지면 그
 *  안에서 실행해야 한다 — 아직 커밋되지 않은 신규 계정 uuid를 그 트랜잭션 밖에서(다른
 *  커넥션으로) 참조하면 FK 제약을 볼 수 없어 실패한다. */
const ensureWalletRow = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    try {
        await models.EconomyWallet.create(
            { user_id: userId, balance_gold: 0, balance_diamond: 0 },
            externalTransaction ? { transaction: externalTransaction } : undefined,
        );
    } catch (error) {
        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
    }
};

/** 기존 원장 행이 지금 요청과 같은 조작인지 확인한다 — 같지 않으면 같은 참조 사건 ID가
 *  다른 내용으로 재사용된 것이다(AC-02 payload mismatch). */
const payloadMatches = (entry, { reason, itemId, currency, amount }) =>
    entry.reason === reason
    && (entry.item_id ?? null) === (itemId ?? null)
    && entry.currency === currency
    && entry.amount === amount;

const referenceEventConflictError = () =>
    createError('참조 사건 ID가 이미 다른 요청에 사용되었습니다.', 409, 'REFERENCE_EVENT_CONFLICT');

/**
 * 지갑 잠금 → (다시 한번) 재처리 방지 확인 → (필요하면) 소유 여부 확인 → 잔액 검증 →
 * 지갑 갱신 → 원장 기록 → (필요하면) 소유권 부여를 하나의 트랜잭션으로 실행한다. amount는
 * 양수(지급)/음수(차감) 모두 가능하다.
 *
 * CODEX-2(AC-03) 대응: options.transaction으로 이미 열려 있는 부모 트랜잭션(예: 회원가입의
 * userRepository.withTransaction)을 받으면 새 트랜잭션을 열지 않고 그 트랜잭션 위에서
 * 그대로 실행한다 — 신규 계정처럼 아직 커밋되지 않은 행을 참조해야 하는 호출부가 별도
 * 트랜잭션을 열면(경쟁하는 트랜잭션) 그 계정 행을 보지 못해 FK 제약에 걸리거나, 부모가
 * 실패해도 이미 커밋되어 버려 원자성이 깨진다("accept the parent transaction rather than
 * opening a competing transaction before the new user commits").
 */
const applyLedgerTransaction = async (db, {
    userId, reason, currency, amount, itemId = null, itemType = null, referenceEventId, entitlementSource = null,
}, { transaction: externalTransaction = null } = {}) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!isBoundedAmount(amount)) {
        throw createError('금액이 허용 범위를 벗어난 정수여야 합니다.', 400, 'AMOUNT_OUT_OF_RANGE');
    }

    const models = economyModels(db);
    const payload = { reason, itemId, currency, amount };

    // 계정 범위 사전 조회(최적화) — 대부분의 재전송은 이 단계에서 잡힌다. 진짜 동시
    // 요청처럼 이 조회를 둘 다 통과하는 경우는 아래 잠금 안 재확인이 마저 처리한다.
    const preExisting = await models.EconomyLedgerEntry.findOne({
        where: { user_id: userId, reference_event_id: referenceEventId },
        ...(externalTransaction ? { transaction: externalTransaction } : {}),
    });
    if (preExisting) {
        if (!payloadMatches(preExisting, payload)) throw referenceEventConflictError();
        return { idempotent: true, ledgerEntry: preExisting };
    }

    await ensureWalletRow(db, userId, externalTransaction);

    const runWrite = async (t) => {
        const wallet = await models.EconomyWallet.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        // 잠금을 잡은 뒤 재확인(recheck-after-lock) — 소유권/잔액 검증보다 먼저 한다.
        // 동시에 들어온 같은 키 재시도가 이 지갑 잠금 뒤에서 대기했다면, 앞선 요청이
        // 이미 커밋한 결과를 그대로 돌려받아야 한다(소유권 재검사로 잘못 거부되면 안 됨).
        const committed = await models.EconomyLedgerEntry.findOne({
            where: { user_id: userId, reference_event_id: referenceEventId },
            transaction: t,
        });
        if (committed) {
            if (!payloadMatches(committed, payload)) throw referenceEventConflictError();
            return { idempotent: true, ledgerEntry: committed };
        }

        if (itemId) {
            const owned = await models.EconomyEntitlement.findOne({
                where: { user_id: userId, item_id: itemId },
                transaction: t,
            });
            if (owned) {
                throw createError('이미 보유한 상품입니다.', 409, 'ITEM_ALREADY_OWNED');
            }
        }

        const column = CURRENCY_TO_WALLET_COLUMN[currency];
        const newBalance = wallet[column] + amount;
        if (newBalance < 0) {
            throw createError('잔액이 부족합니다.', 400, 'INSUFFICIENT_BALANCE');
        }
        if (newBalance > MAX_BALANCE) {
            throw createError('잔액 한도를 초과했습니다.', 400, 'BALANCE_LIMIT_EXCEEDED');
        }

        await wallet.update({ [column]: newBalance }, { transaction: t });

        let ledgerEntry;
        try {
            ledgerEntry = await models.EconomyLedgerEntry.create({
                user_id: userId,
                reason,
                item_id: itemId,
                currency,
                amount,
                balance_after: newBalance,
                reference_event_id: referenceEventId,
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_REFERENCE_EVENT'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        if (itemId) {
            await models.EconomyEntitlement.create({
                user_id: userId,
                item_id: itemId,
                item_type: itemType,
                source: entitlementSource,
            }, { transaction: t });
        }

        return { idempotent: false, ledgerEntry, walletBalance: newBalance };
    };

    const resolveDuplicate = async (transactionForLookup) => {
        const existing = await models.EconomyLedgerEntry.findOne({
            where: { user_id: userId, reference_event_id: referenceEventId },
            ...(transactionForLookup ? { transaction: transactionForLookup } : {}),
        });
        if (!existing) return null;
        if (!payloadMatches(existing, payload)) throw referenceEventConflictError();
        return { idempotent: true, ledgerEntry: existing };
    };

    if (externalTransaction) {
        try {
            return await runWrite(externalTransaction);
        } catch (error) {
            if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
                const resolved = await resolveDuplicate(externalTransaction);
                if (resolved) return resolved;
            }
            throw error;
        }
    }

    try {
        return await models.sequelize.transaction(runWrite);
    } catch (error) {
        if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
            const resolved = await resolveDuplicate(null);
            if (resolved) return resolved;
        }
        throw error;
    }
};

/** 선택값이 없는(null) 계정에만 금빛가면/평민 기본값을 채운다(A-04) — 기존 유효 선택은
 *  절대 덮어쓰지 않는다.
 *
 *  R-IMPL(2026-09-10, AC-03 재검토): 이전 버전은 findOrCreate로 읽은 스냅샷("아직
 *  null")을 근거로 loadout 인스턴스를 무조건 update(patch)했다 — 그 읽기와 쓰기 사이에
 *  동시 equipItem 요청이 끼어들어 같은 컬럼에 유효한 선택을 먼저 커밋하면, 이 무조건
 *  쓰기가 그 값을 되돌려 덮어썼다(read-then-blind-write 경쟁 상태). 지금은 WHERE 절에
 *  "지금도 컬럼이 null"이라는 조건을 실은 모델 수준 UPDATE로 바꿨다 — 이 조건부 UPDATE는
 *  단일 SQL 문이라 원자적이므로, 그 사이 다른 트랜잭션이 이미 값을 넣었다면 0행에
 *  적용되어 그 값을 그대로 둔다(컬럼별로 각각 조건부라 두 컬럼이 독립적으로 안전하다).
 *
 *  CODEX-2(AC-03) 대응: externalTransaction이 주어지면(신규 가입 등) 그 트랜잭션 안에서
 *  실행한다 — applyLedgerTransaction과 같은 이유(부모 트랜잭션 재사용, 경쟁 트랜잭션
 *  금지). */
const ensureDefaultLoadout = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    const txOptions = externalTransaction ? { transaction: externalTransaction } : {};

    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId },
        ...txOptions,
    });

    await models.EconomyLoadout.update(
        { selected_profile_photo_id: DEFAULT_PROFILE_PHOTO_ID },
        { where: { user_id: userId, selected_profile_photo_id: null }, ...txOptions },
    );
    await models.EconomyLoadout.update(
        { selected_profile_border_id: DEFAULT_PROFILE_BORDER_ID },
        { where: { user_id: userId, selected_profile_border_id: null }, ...txOptions },
    );

    return models.EconomyLoadout.findOne({ where: { user_id: userId }, ...txOptions });
};

/** 기본 프로필 16종 + 평민 테두리 1종을 중복 없이 지급한다(AC-03). 지갑/소유품 조회
 *  (getWalletSummary)·장착(equipItem) 경로가 이 함수를 호출해 지연 지급을 보장하고,
 *  회원가입 경로(auth.service.js signup·socialAuth.service.js completeSocialSignup)는
 *  계정 생성 트랜잭션 안에서 직접 호출해 신규 계정이 커밋되는 순간 이미 지급이 끝나
 *  있게 한다(CODEX-2 재검토: "lazy grant on wallet/equip is NOT signup/backfill" — 지연
 *  지급은 신규 가입을 대신하지 못하므로, 가입 자체가 이 함수를 명시적으로 호출해야 한다).
 *  기존 계정(이 슬라이스 이전에 만들어진 계정) 이관은 backend/db/backfillEconomy.js가
 *  같은 함수를 배치로 호출한다. 이미 지급된 항목은 원장의 (user_id, reference_event_id)
 *  유일 제약으로 조용히 건너뛴다(재실행/재호출 모두 멱등).
 *
 *  externalTransaction이 주어지면(회원가입 트랜잭션 등) 그 안에서 실행한다 —
 *  applyLedgerTransaction/ensureDefaultLoadout 참고. */
const ensureDefaultEntitlements = async (userId, db = defaultDb(), { transaction: externalTransaction = null } = {}) => {
    for (const item of listDefaultGrantItems()) {
        const referenceEventId = `default-grant:${userId}:${item.id}`;
        try {
            await applyLedgerTransaction(db, {
                userId,
                reason: 'DEFAULT_GRANT',
                currency: CURRENCIES.GOLD,
                amount: 0,
                itemId: item.id,
                itemType: item.type,
                referenceEventId,
                entitlementSource: 'DEFAULT_GRANT',
            }, { transaction: externalTransaction });
        } catch (error) {
            if (error?.code === 'ITEM_ALREADY_OWNED') continue;
            throw error;
        }
    }
    return ensureDefaultLoadout(db, userId, externalTransaction);
};

/** 자기 계정의 지갑·소유품·장착 상태를 한 번에 돌려준다. 매 호출마다 기본 지급을
 *  보장해 신규·기존 계정을 같은 경로로 처리한다. */
const getWalletSummary = async (userId, db = defaultDb()) => {
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const [wallet, entitlements, loadout] = await Promise.all([
        models.EconomyWallet.findOne({ where: { user_id: userId } }),
        models.EconomyEntitlement.findAll({ where: { user_id: userId }, order: [['id', 'ASC']] }),
        models.EconomyLoadout.findOne({ where: { user_id: userId } }),
    ]);

    return {
        balanceGold: wallet ? wallet.balance_gold : 0,
        balanceDiamond: wallet ? wallet.balance_diamond : 0,
        entitlements: entitlements.map((row) => ({
            itemId: row.item_id,
            itemType: row.item_type,
            source: row.source,
            acquiredAt: row.acquired_at,
        })),
        loadout: {
            selectedProfilePhotoId: loadout?.selected_profile_photo_id ?? null,
            selectedProfileBorderId: loadout?.selected_profile_border_id ?? null,
            selectedCardFrameId: loadout?.selected_card_frame_id ?? null,
        },
    };
};

const listTransactions = async (userId, { limit = 50 } = {}, db = defaultDb()) => {
    const models = economyModels(db);
    const rows = await models.EconomyLedgerEntry.findAll({
        where: { user_id: userId },
        order: [['id', 'DESC']],
        limit,
    });
    return rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        itemId: row.item_id,
        currency: row.currency,
        amount: row.amount,
        balanceAfter: row.balance_after,
        referenceEventId: row.reference_event_id,
        createdAt: row.created_at,
    }));
};

// F-09 개별·일괄 구매 공통 처리. ─────────────────────────────────────────────
//
// 하나의 요청 식별자(referenceEventId)가 여러 상품을 가리킬 수 있으므로, 상품별 원장
// 유일 키는 `${referenceEventId}::item::${itemId}`로 파생한다 — itemId 중복은 이미
// 앞에서 거부하므로 이 파생 키는 같은 번들 안에서 항상 서로 다르고, 같은 번들을
// 재시도하면 항상 같은 값으로 재계산되어 applyLedgerTransaction 자체의 재처리 방지도
// 그대로 작동한다(이중 방어).
const derivePurchaseItemReferenceEventId = (referenceEventId, itemId) => `${referenceEventId}::item::${itemId}`;

/** 구매 요청 전체(품목 id 목록)를 정렬해 정규화한다 — 같은 참조 사건 ID의 재시도가
 *  요청 순서만 다른 경우도 "같은 요청"으로 인정하고, 실제로 다른 상품 구성이면 충돌로
 *  거부한다(AC-04 payload mismatch, F0367 payloadMatches와 같은 목적). */
const normalizePurchaseRequestPayload = (items) => ({ itemIds: items.map((entry) => entry.itemId).slice().sort() });

const purchasePayloadsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 개별 구매(purchaseItem)가 기존에 쓰던 것과 같은 오류(코드 REFERENCE_EVENT_CONFLICT)를
// 그대로 재사용한다 — 참조 사건 ID 재사용이 다른 내용과 충돌한다는 개념은 원장 한 줄이든
// 구매 요청 번들이든 동일하므로, 새 코드를 만들지 않고 기존 소비자(라우트·프론트
// pendingPurchases 판정)와의 호환을 그대로 유지한다.
const purchaseRequestConflictError = referenceEventConflictError;

/** 원장 행을 GET /economy/purchases 응답·serializeLedgerEntry와 같은 모양의 평범한
 *  객체로 남긴다 — result_json에 그대로 저장해도, 나중에 그 JSON을 그대로 읽어도 항상
 *  같은 필드 이름(snake_case)을 쓰게 해 idempotent 여부와 무관하게 호출부가 같은 코드로
 *  처리할 수 있게 한다. */
const snapshotLedgerEntry = (ledgerEntry) => (
    typeof ledgerEntry.get === 'function' ? ledgerEntry.get({ plain: true }) : ledgerEntry
);

/**
 * 개별·일괄 구매의 공통 원자적 처리. items는 [{ itemId }, ...] 형태이며 1개면 개별
 * 구매, 2개 이상이면 일괄 구매다(AC-01/AC-02). 클라이언트가 보낸 가격·재화는 절대
 * 읽지 않는다 — 모든 상품은 catalog.getCatalogItem으로만 조회한다(AC-04).
 *
 * 구현 계약(작업 지시서 계획 메모): 빈 목록·중복 상품·존재하지 않거나 구매 불가능한
 * 상품은 지갑을 건드리기 전에 즉시 거부한다. 통과한 상품들은 지갑 잠금 → 재처리 방지
 * 재확인 → 상품별 applyLedgerTransaction(같은 외부 트랜잭션 t 위에서 실행, 품목별 독립
 * 커밋 없음)을 순서대로 실행하고, 하나라도 실패하면(존재 여부·이미 보유·잔액 부족 등)
 * 그 오류가 트랜잭션 전체를 롤백시켜 앞서 처리된 품목의 차감·지급도 함께 되돌아간다.
 * 모든 품목이 성공하면 그 결과를 EconomyPurchaseRequest 한 행으로 같은 트랜잭션에서
 * 커밋해, 이후 같은 참조 사건 ID로 조회·재시도하면(getPurchaseResult, 또는 이 함수를
 * 같은 인자로 재호출) 새로 차감하지 않고 이미 커밋된 결과를 그대로 돌려준다(AC-04).
 */
const purchaseItems = async ({ userId, items, referenceEventId }, db = defaultDb()) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw createError('구매할 상품 목록이 비어 있습니다.', 400, 'EMPTY_PURCHASE_ITEMS');
    }
    const itemIds = items.map((entry) => entry?.itemId);
    if (itemIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_PURCHASE_ITEM');
    }
    if (new Set(itemIds).size !== itemIds.length) {
        throw createError('같은 상품을 중복으로 요청할 수 없습니다.', 400, 'DUPLICATE_PURCHASE_ITEM');
    }

    const kind = items.length > 1 ? 'BULK' : 'SINGLE';
    const payload = normalizePurchaseRequestPayload(items);
    const models = economyModels(db);

    // 재처리 방지 조회(AC-04)는 카탈로그 검증보다 먼저 한다 — 이미 커밋된 요청을 같은
    // 참조 사건 ID로 재시도했다면, 그 사이 카탈로그 상태가 바뀌었더라도(상품이 나중에
    // purchasable:false로 바뀌는 등) 항상 기존 커밋 결과를 그대로 복원해야 한다
    // (CODEX-1 AC-04 재검토: "카탈로그 검증이 기존 성공 조회보다 먼저"였던 순서를
    // 뒤집음 — 이미 커밋된 요청을 다시 카탈로그 규칙으로 거부하면 멱등성 계약이 깨진다).
    // 카탈로그 검증은 이 조회를 통과해 "완전히 새로운 요청"으로 판명된 뒤에만 실행한다.
    const preExisting = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
    if (preExisting) {
        if (!purchasePayloadsEqual(preExisting.payload_json, payload)) throw purchaseRequestConflictError();
        return { idempotent: true, kind: preExisting.kind, results: preExisting.result_json };
    }

    // 카탈로그 조회·구매 가능 여부 확인은 지갑을 건드리기 전에 끝낸다 — 표시용
    // 이모티콘처럼 존재하지 않거나 purchasable:false인 상품이 하나라도 섞여 있으면
    // 트랜잭션을 열지도 않고 즉시 거부한다(AC-05, 부작용 없음).
    const resolvedItems = itemIds.map((itemId) => {
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.purchasable !== true) {
            throw createError(`존재하지 않거나 구매할 수 없는 상품입니다: ${itemId}`, 400, 'ITEM_NOT_PURCHASABLE');
        }
        return catalogItem;
    });

    await ensureWalletRow(db, userId);

    const runWrite = async (t) => {
        // 지갑 행을 한 번만 잠그면 GOLD·DIAMOND 두 컬럼 모두 이 트랜잭션 동안 안전하다
        // (한 행에 두 재화 컬럼이 함께 있다, economy.model.js 참고).
        await models.EconomyWallet.findOne({ where: { user_id: userId }, transaction: t, lock: t.LOCK.UPDATE });

        // 잠금 뒤 재확인(recheck-after-lock) — applyLedgerTransaction과 같은 이유로,
        // 동시에 들어온 같은 참조 사건 ID 재시도가 이 지갑 잠금 뒤에서 대기했다면 먼저
        // 커밋된 결과를 그대로 돌려받아야 한다.
        const committed = await models.EconomyPurchaseRequest.findOne({
            where: { user_id: userId, reference_event_id: referenceEventId },
            transaction: t,
        });
        if (committed) {
            if (!purchasePayloadsEqual(committed.payload_json, payload)) throw purchaseRequestConflictError();
            return { idempotent: true, kind: committed.kind, results: committed.result_json };
        }

        const results = [];
        for (const catalogItem of resolvedItems) {
            // eslint-disable-next-line no-await-in-loop -- 같은 외부 트랜잭션 t 위에서
            // 순서대로 실행해야 한다(품목별 독립 커밋 금지) — Promise.all로 병렬화하면
            // 같은 지갑 행에 대한 경합이 생기고 트랜잭션 경계도 흐트러진다.
            const outcome = await applyLedgerTransaction(db, {
                userId,
                reason: 'PURCHASE',
                currency: catalogItem.currency ?? CURRENCIES.GOLD,
                amount: -catalogItem.priceGold,
                itemId: catalogItem.id,
                itemType: catalogItem.type,
                referenceEventId: derivePurchaseItemReferenceEventId(referenceEventId, catalogItem.id),
                entitlementSource: 'PURCHASE',
            }, { transaction: t });
            results.push(snapshotLedgerEntry(outcome.ledgerEntry));
        }

        let purchaseRequest;
        try {
            purchaseRequest = await models.EconomyPurchaseRequest.create({
                user_id: userId,
                reference_event_id: referenceEventId,
                kind,
                payload_json: payload,
                result_json: results,
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw Object.assign(
                    createError('이미 처리된 참조 사건입니다.', 409, 'DUPLICATE_PURCHASE_REQUEST'),
                    { referenceEventId },
                );
            }
            throw error;
        }

        return { idempotent: false, kind, results, purchaseRequestId: purchaseRequest.id };
    };

    const resolveDuplicateRequest = async () => {
        const existing = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
        if (!existing) return null;
        if (!purchasePayloadsEqual(existing.payload_json, payload)) throw purchaseRequestConflictError();
        return { idempotent: true, kind: existing.kind, results: existing.result_json };
    };

    try {
        return await models.sequelize.transaction(runWrite);
    } catch (error) {
        if (error?.code === 'DUPLICATE_PURCHASE_REQUEST') {
            const resolved = await resolveDuplicateRequest();
            if (resolved) return resolved;
        }
        throw error;
    }
};

/** 개별 구매 — purchaseItems(품목 1개)에 위임하고, 기존 라우트(POST /economy/purchase)와
 *  호환되도록 결과 모양(`{ idempotent, ledgerEntry }`)을 그대로 유지한다. results[0]은
 *  snapshotLedgerEntry가 만든 평범한 객체라 economy.routes.js의 serializeLedgerEntry가
 *  기존과 동일하게 동작한다. */
const purchaseItem = async ({ userId, itemId, referenceEventId }, db = defaultDb()) => {
    const result = await purchaseItems({ userId, items: [{ itemId }], referenceEventId }, db);
    return { idempotent: result.idempotent, ledgerEntry: result.results[0] };
};

/** 커밋 후 응답 유실을 복구한다(AC-04) — 인증된 본인 계정 범위에서만 조회한다. 구매가
 *  실제로 커밋된 경우에만 EconomyPurchaseRequest 행이 존재하므로, 이 함수가 null을
 *  돌려주는 것은 "아직 커밋된 적 없음"(요청이 아예 도달하지 않았거나, 도달했어도
 *  커밋 전 오류로 롤백됨)을 뜻한다 — 그 두 경우를 이 함수 하나로는 구분하지 않는다.
 *  호출부(라우트)는 원래 요청이 명시적으로 거부 응답을 받았는지 여부로 그 둘을 구분한다
 *  — 명시적 거부를 받았다면 애초에 이 함수를 부를 필요가 없고, 응답을 못 받았을
 *  때만(타임아웃·연결 단절) 이 함수로 확인한다. */
const getPurchaseResult = async (userId, referenceEventId, db = defaultDb()) => {
    if (typeof referenceEventId !== 'string' || referenceEventId.length === 0) {
        throw createError('참조 사건 ID(referenceEventId)가 필요합니다.', 400, 'MISSING_REFERENCE_EVENT_ID');
    }
    const models = economyModels(db);
    const existing = await models.EconomyPurchaseRequest.findOne({ where: { user_id: userId, reference_event_id: referenceEventId } });
    if (!existing) return null;
    return { kind: existing.kind, results: existing.result_json, createdAt: existing.created_at };
};

/** QA/운영 보상 지급 — role 검사는 라우트 계층 책임이다(실제 계정 데이터 기준, 라우트
 *  참고). currency는 GOLD/DIAMOND 중 하나를 명시해야 하며 기본값은 GOLD다. amount는
 *  1 이상의 정수만 허용한다(음수·0 지급은 이 경로의 목적이 아니다) — 상한·안전 정수
 *  검증은 applyLedgerTransaction이 공통으로 담당한다. */
const grantReward = async ({ userId, amount, currency = CURRENCIES.GOLD, reason = 'REWARD', referenceEventId }, db = defaultDb()) => {
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
        throw createError('amount는 1 이상의 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }
    return applyLedgerTransaction(db, { userId, reason, currency, amount, referenceEventId });
};

// F-12(A-03): achievementService.js가 업적 보상(재화)을 지급할 때 쓰는 통로. grantReward와
// 거의 같지만 외부(호출부가 이미 열어 둔) 트랜잭션 위에서 실행할 수 있어야 한다 — 업적
// 달성 행(achievement_grants) 삽입과 재화 지급이 하나의 트랜잭션으로 원자적이어야
// 하기 때문이다(전부 성공하거나 전부 롤백). reason은 항상 'ACHIEVEMENT_REWARD'로 고정해
// 이 통로로 들어온 원장 항목을 다른 지급 경로와 구분할 수 있게 한다.
const grantAchievementCurrency = async (
    { userId, currency, amount, referenceEventId },
    db = defaultDb(),
    { transaction: externalTransaction = null } = {},
) => {
    if (!isValidCurrency(currency)) {
        throw createError('알 수 없는 재화입니다.', 400, 'INVALID_CURRENCY');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
        throw createError('amount는 1 이상의 정수여야 합니다.', 400, 'INVALID_AMOUNT');
    }
    return applyLedgerTransaction(
        db,
        { userId, reason: 'ACHIEVEMENT_REWARD', currency, amount, referenceEventId },
        { transaction: externalTransaction },
    );
};

// F-12(A-03): 업적 보상(직업 테두리 등 아이템) 지급 통로. ensureDefaultEntitlements와 같은
// 트릭(currency는 항상 필요하므로 GOLD 0원 원장 항목에 아이템 소유권을 얹는다)을 쓰되,
// 이미 보유 중인 경우(A-03: "기존 테두리 보유가 거래 전체 실패를 일으키면 안 된다")
// ITEM_ALREADY_OWNED를 거래 실패로 취급하지 않고 이미 만족된 상태로 삼켜, 바깥
// 트랜잭션(achievement_grants 삽입 포함)이 이 이유만으로 롤백되지 않게 한다.
const grantAchievementItem = async (
    { userId, itemId, itemType, referenceEventId },
    db = defaultDb(),
    { transaction: externalTransaction = null } = {},
) => {
    try {
        return await applyLedgerTransaction(
            db,
            {
                userId, reason: 'ACHIEVEMENT_REWARD', currency: CURRENCIES.GOLD, amount: 0,
                itemId, itemType, referenceEventId, entitlementSource: 'ACHIEVEMENT_GRANT',
            },
            { transaction: externalTransaction },
        );
    } catch (error) {
        if (error?.code === 'ITEM_ALREADY_OWNED') {
            return { idempotent: true, alreadyOwned: true };
        }
        throw error;
    }
};

/** 소유권·아이템 종류를 검증한 뒤에만 장착한다(AC-05). itemId가 카탈로그에 없는
 *  임의 문자열(파일 경로 등)이면 ITEM_TYPE_MISMATCH로 거부되고, 카탈로그에 있어도
 *  보유하지 않았으면 ITEM_NOT_OWNED(403)로 거부된다. */
const equipItem = async ({ userId, slot, itemId }, db = defaultDb()) => {
    const expectedType = SLOT_TO_ITEM_TYPE[slot];
    const column = SLOT_TO_LOADOUT_COLUMN[slot];
    if (!expectedType || !column) {
        throw createError('알 수 없는 장착 슬롯입니다.', 400, 'UNKNOWN_EQUIP_SLOT');
    }
    if (typeof itemId !== 'string' || itemId.length === 0) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
    }

    // R-IMPL(2026-09-10, AC-03 재검토): 기본 지급은 지금까지 getWalletSummary(지갑/소유품
    // 조회 GET) 경로를 탄 계정에만 보장됐다 — 신규 가입 직후든 이관된 기존 계정이든, 그
    // GET을 한 번도 거치지 않고 곧바로 기본 프로필/테두리를 장착하려 하면 실제로는 아직
    // 그 항목을 보유하지 않은 상태라 ITEM_NOT_OWNED로 잘못 거부됐다. 별도의 가입 훅을
    // 추가하는 대신, 장착도 "계정이 경제 시스템을 처음 건드리는 지점"이 될 수 있다는
    // 전제로 여기서도 같은 지급을 보장한다 — 멱등하므로 반복 호출해도 안전하다.
    await ensureDefaultEntitlements(userId, db);

    const isFreeCardFrame = slot === 'PLAYER_CARD_FRAME' && itemId === FREE_CARD_FRAME_ID;
    const models = economyModels(db);

    if (!isFreeCardFrame) {
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
    }

    const [loadout] = await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId },
    });
    await loadout.update({ [column]: itemId });
    return loadout;
};

// F-13 AC-02 설계 감사(운영자, 2026-09-11) — CODEX-9가 도입했던 clientIntentAt(클라이언트
// 벽시계 시각) + lastProfileEquipIntentAtByUser(인메모리 Map) 높은-수위 표시 방식은 세 가지로
// 깨져 있어 제거했다:
//   1) Date.now()는 전순서가 아니다 — 같은 밀리초에 겹친 두 클릭은 순서를 구분할 수 없고,
//      기기 시계가 뒤로 가거나 어긋나면 정당한 나중 요청이 거부된다. 미래의 유한한 시각값이
//      들어오면 그 뒤로 영영(세션이 바뀌어도) 그 계정의 의도 판정을 오염시킨다.
//   2) Map 갱신이 트랜잭션 커밋보다 먼저 실행됐다 — update가 던지거나 커밋 자체가 실패해도
//      Map은 이미 전진해 있어, 그 뒤의 유효한 재시도가 조용히 무시될 수 있었다(Map이 DB와
//      원자적이지 않음).
//   3) 인메모리 값은 프로세스 재시작으로 사라지고 인스턴스마다 다르다 — 영속적 장착 보장을
//      전제로 삼을 수 없다.
// 대체 설계는 새 상태를 전혀 두지 않는다: 아래 SELECT ... FOR UPDATE 행 잠금이 겹치는
// 두 확정 요청을 이미 완전히 직렬화하므로(한쪽이 커밋할 때까지 다른 쪽은 대기), 서버는
// "먼저 잠금을 놓은 요청이 먼저, 그 다음 요청이 나중" 순서로 자연스럽게 커밋한다 — 이
// 순서는 동일 커넥션에서 순서대로 보낸 요청이라면 사실상 거의 항상 전송 순서와 일치한다
// (진짜 네트워크 재정렬은 극히 드물다). 사용자가 지금 보는 화면이 "가장 나중에 시작한
// 확정"과 항상 일치하는지는 프런트(economy.store.js의 loadoutAttemptSeq)가 순수 클라이언트
// 로컬 판단만으로 이미 보장한다(같은 탭 안에서 더 늦게 시작된 시도가 있으면 이전 시도의
// 응답은 도착 순서와 무관하게 절대 store.loadout에 반영되지 않는다) — 이 보장은 서버가
// 무엇을 커밋했는지와 무관하게 성립하므로, 서버 쪽에 별도의 순서 추적 상태가 없어도
// 화면은 항상 사용자의 마지막 결정을 보여준다. 남는 잔여 위험(진짜 네트워크 재정렬로
// DB 최종값이 화면과 다르게 커밋되는 경우)은 극히 드물고, 다음 자연스러운 재조회(편집기
// 재오픈·새로고침·재로그인)에서 스스로 바로잡힌다 — 이 잔여 위험을 감수하는 쪽이 세
// 가지 실제 결함을 가진 메커니즘을 유지하는 것보다 낫다는 것이 이번 감사의 결론이다.

/** F-13 AC-01/AC-02: 프로필 사진·테두리를 하나의 확정으로 함께 저장한다. photoItemId·
 *  borderItemId 각각은 넘기지 않으면(undefined) 그 슬롯을 건드리지 않는다 — 사진만
 *  바뀐 확인은 photoItemId만 보내면 된다. 두 슬롯 모두 equipItem과 같은 카탈로그 조회·
 *  소유권 검사(ITEM_TYPE_MISMATCH/ITEM_NOT_OWNED)를 거치며, 검증은 어떤 컬럼도 갱신하기
 *  전에 전부 끝낸다 — 한쪽이라도 실패하면 loadout.update가 아예 호출되지 않아 이전 상태가
 *  그대로 유지된다(부분 저장 없음). 두 컬럼을 실제로 바꾸는 곳은 이 함수 끝의 단일
 *  loadout.update(updates) 한 번뿐이라, DB에는 하나의 UPDATE 문으로만 반영된다. 겹치는
 *  두 확정 요청은 아래 행 잠금으로 완전히 직렬화된다(동시 갱신 없음). */
const equipProfileAppearance = async ({ userId, photoItemId, borderItemId }, db = defaultDb()) => {
    const slots = [
        ['PROFILE_PHOTO', photoItemId],
        ['PROFILE_BORDER', borderItemId],
    ].filter(([, itemId]) => itemId !== undefined);

    if (slots.length === 0) {
        throw createError('변경할 프로필 항목이 없습니다.', 400, 'EMPTY_PROFILE_EQUIP_REQUEST');
    }
    for (const [, itemId] of slots) {
        if (typeof itemId !== 'string' || itemId.length === 0) {
            throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
        }
    }

    // equipItem과 같은 이유(R-IMPL 2026-09-10) — 아직 getWalletSummary를 거치지 않은
    // 계정이 곧바로 프로필을 확정하려 해도 기본 지급이 먼저 보장돼야 ITEM_NOT_OWNED로
    // 잘못 거부되지 않는다.
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const updates = {};
    for (const [slot, itemId] of slots) {
        const expectedType = SLOT_TO_ITEM_TYPE[slot];
        const column = SLOT_TO_LOADOUT_COLUMN[slot];
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }
        // eslint-disable-next-line no-await-in-loop -- 슬롯이 최대 2개뿐이고, 두 검증 모두
        // 실제 컬럼을 갱신하기 전에 순서대로 끝나야 한다(부분 검증 후 병렬 갱신 금지).
        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
        updates[column] = itemId;
    }

    // 행이 없으면 미리 만들어 둔다(잠금 트랜잭션 안에서는 findOrCreate 대신 조회만 하면
    // 되게 한다 — ensureWalletRow와 같은 관례).
    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId },
    });

    // 여기서부터 실제 컬럼을 바꾸는 지점까지를 SELECT ... FOR UPDATE로 잠근 트랜잭션 안에
    // 둔다 — applyLedgerTransaction의 지갑 잠금과 같은 이유다. 겹치는 두 확정 요청이 동시에
    // 이 함수를 호출해도, 뒤에 도착한 쪽은 앞선 트랜잭션이 커밋(또는 롤백)해 잠금을 놓을
    // 때까지 완전히 기다렸다가에야 자신의 갱신을 시작한다(동시 갱신 없음, 전부-아니면-무).
    return db.sequelize.transaction(async (t) => {
        const loadout = await models.EconomyLoadout.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        await loadout.update(updates, { transaction: t });
        return loadout;
    });
};

/** F-13 AC-05 전제: 대기방·인게임에서 타인에게도 공개할 사진·테두리 itemId만 돌려준다
 *  (지갑·소유 목록 등 비공개 경제 정보는 절대 포함하지 않는다). 대상 계정에 기본 지급이
 *  아직 안 되어 있어도 조회 전에 보장한다 — 신규 계정이 방에 들어오자마자 loadout이
 *  비어 있는 채로 노출되는 것을 막는다. */
const getPublicProfileLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await models.EconomyLoadout.findAll({ where: { user_id: uniqueUserIds } });

    const byUserId = {};
    for (const userId of uniqueUserIds) byUserId[userId] = { profilePhotoId: null, profileBorderId: null };
    for (const loadout of loadouts) {
        byUserId[loadout.user_id] = {
            profilePhotoId: loadout.selected_profile_photo_id ?? null,
            profileBorderId: loadout.selected_profile_border_id ?? null,
        };
    }
    return byUserId;
};

module.exports = {
    CURRENCIES,
    FREE_CARD_FRAME_ID,
    SLOT_TO_ITEM_TYPE,
    ensureDefaultEntitlements,
    getWalletSummary,
    listTransactions,
    purchaseItem,
    purchaseItems,
    getPurchaseResult,
    grantReward,
    grantAchievementCurrency,
    grantAchievementItem,
    equipItem,
    equipProfileAppearance,
    getPublicProfileLoadouts,
    // 테스트 전용 — 낮은 레벨 원장 적용 로직을 직접 검증할 때 사용한다.
    __internal: { applyLedgerTransaction, ensureWalletRow, ensureDefaultLoadout },
};
