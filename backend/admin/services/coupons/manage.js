'use strict';

// 쿠폰 관리 서비스 파일, 쿠폰 목록 · 만들기 · 켜고 끄기 · 쓴 사람 목록 + 관리자 기록
// coupons.controller.js가 부름, 보상 지급은 하지 않음 (플레이어 쿠폰 입력 = services/ops/coupon.js 한 곳이 장부로 줌)
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');
const { MAX_BALANCE } = require('../../../services/economy/constants');
const { COUPON_CODE_PATTERN, REWARD_TYPES, normalizeCouponCode } = require('../../../services/ops/coupon');

const defaultDb = () => require('../../../repositories/common/db');

const MAX_USES_LIMIT = 2_147_483_647;
const isoOf = (value) => (value ? new Date(value).toISOString() : null);

const invalidCoupon = (field) => {
    const error = createError('쿠폰 값이 규칙에 맞지 않아요. 표시된 칸을 고쳐 주세요.', 400, 'INVALID_COUPON');
    error.details = { field };
    return error;
};
const couponNotFound = () => createError('쿠폰을 찾을 수 없어요.', 404, 'COUPON_NOT_FOUND');

// 표 한 줄 → 화면 모양 (예: { reward_type:'GOLD', is_active:1 } → { rewardType:'GOLD', isActive:true, … })
const toView = (row) => ({
    id: Number(row.id),
    code: row.code,
    rewardType: row.reward_type,
    rewardAmount: Number(row.reward_amount),
    maxUses: row.max_uses === null || row.max_uses === undefined ? null : Number(row.max_uses),
    usedCount: Number(row.used_count),
    startsAt: isoOf(row.starts_at),
    endsAt: isoOf(row.ends_at),
    isActive: Boolean(row.is_active),
    createdAt: isoOf(row.created_at),
});

const select = (db, sql, replacements) => db.sequelize.query(queryQueue.withTimeoutHint(sql), {
    replacements, type: db.Sequelize.QueryTypes.SELECT,
});

// 목록: 새로 만든 것부터 50줄씩
const listCoupons = async ({ before, limit = 50 }, { db = defaultDb() } = {}) => queryQueue.run(async () => {
    const rows = await select(db, `SELECT id, code, reward_type, reward_amount, max_uses, used_count, starts_at, ends_at, is_active, created_at
        FROM coupons ${before ? 'WHERE id < :before' : ''} ORDER BY id DESC LIMIT :limit`, { before, limit: limit + 1 });
    const items = rows.slice(0, limit).map(toView);
    return { items, nextBefore: rows.length > limit ? items[items.length - 1].id : null };
});

// 날짜 칸: null 또는 ISO 글자 → Date (틀리면 그 칸 이름으로 400)
const readOptionalDate = (value, field) => {
    if (value === null || value === undefined) return null;
    const date = new Date(String(value));
    if (typeof value !== 'string' || Number.isNaN(date.getTime())) throw invalidCoupon(field);
    return date;
};

// 만들 값 검사 → 표 한 줄 (코드는 대문자, 끝 시각은 시작 시각 뒤)
// 예: { code:'welcome-1', rewardType:'GOLD', rewardAmount:500 } → { code:'WELCOME-1', reward_type:'GOLD', … }
const toNewRow = (input) => {
    const code = normalizeCouponCode(input.code);
    if (!COUPON_CODE_PATTERN.test(code)) throw invalidCoupon('code');
    if (!REWARD_TYPES.includes(input.rewardType)) throw invalidCoupon('rewardType');
    const amount = input.rewardAmount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_BALANCE) throw invalidCoupon('rewardAmount');
    const maxUses = input.maxUses ?? null;
    if (maxUses !== null && (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > MAX_USES_LIMIT)) throw invalidCoupon('maxUses');
    const startsAt = readOptionalDate(input.startsAt, 'startsAt');
    const endsAt = readOptionalDate(input.endsAt, 'endsAt');
    if (startsAt && endsAt && endsAt <= startsAt) throw invalidCoupon('endsAt');
    return { code, reward_type: input.rewardType, reward_amount: amount, max_uses: maxUses, starts_at: startsAt, ends_at: endsAt };
};

// 만들기 → { coupon }
const createCoupon = async ({ req, input }, { db = defaultDb() } = {}) => {
    const fields = toNewRow(input);
    try {
        return await db.sequelize.transaction(async (transaction) => {
            const now = new Date();
            const row = await db.Coupon.create({
                ...fields, used_count: 0, is_active: true, created_by_admin_id: req.admin.id, created_at: now, updated_at: now,
            }, { transaction });
            const coupon = toView(row.get({ plain: true }));
            await audit.record({
                req, action: AUDIT_ACTIONS.COUPON_CREATE, targetType: 'coupon', targetId: coupon.id, after: coupon,
            }, { transaction, db });
            return { coupon };
        });
    } catch (error) {
        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
        throw createError('이미 있는 쿠폰 코드예요. 다른 코드를 써 주세요.', 409, 'COUPON_CODE_EXISTS');
    }
};

// 켜고 끄기 → { coupon } (지우지 않음, 끄면 플레이어 입력이 COUPON_INACTIVE)
const toggleCoupon = async ({ req, id, isActive }, { db = defaultDb() } = {}) => db.sequelize.transaction(async (transaction) => {
    const row = await db.Coupon.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw couponNotFound();
    const before = toView(row.get({ plain: true }));
    await row.update({ is_active: isActive, updated_at: new Date() }, { transaction });
    const coupon = toView(row.get({ plain: true }));
    await audit.record({
        req, action: AUDIT_ACTIONS.COUPON_TOGGLE, targetType: 'coupon', targetId: id,
        before: { isActive: before.isActive }, after: { isActive: coupon.isActive },
    }, { transaction, db });
    return { coupon };
});

// 쓴 사람 목록 → { items:[{ id, userUuid, nickname, redeemedAt }], nextBefore } (최근 것부터, 커서 = 사용 id)
const listRedemptions = async ({ id, before, limit = 50 }, { db = defaultDb() } = {}) => queryQueue.run(async () => {
    const [coupon] = await select(db, 'SELECT id FROM coupons WHERE id = :id', { id });
    if (!coupon) throw couponNotFound();
    let cursor = '';
    const replacements = { id, limit: limit + 1 };
    if (before) {
        // 커서 줄 시각은 SQL 안에서 바로 읽음 (JS로 꺼냈다 넣으면 시간대가 어긋날 수 있음), 없는 커서면 빈 목록
        const at = '(SELECT c.redeemed_at FROM coupon_redemptions c WHERE c.id = :before AND c.coupon_id = :id)';
        cursor = `AND (r.redeemed_at < ${at} OR (r.redeemed_at = ${at} AND r.id < :before))`;
        replacements.before = before;
    }
    const rows = await select(db, `SELECT r.id, r.user_id, u.nickname, r.redeemed_at FROM coupon_redemptions r
        LEFT JOIN users u ON u.uuid = r.user_id WHERE r.coupon_id = :id ${cursor}
        ORDER BY r.redeemed_at DESC, r.id DESC LIMIT :limit`, replacements);
    const items = rows.slice(0, limit).map((row) => ({
        id: row.id, userUuid: row.user_id, nickname: row.nickname ?? null, redeemedAt: isoOf(row.redeemed_at),
    }));
    return { items, nextBefore: rows.length > limit ? items[items.length - 1].id : null };
});

module.exports = { listCoupons, createCoupon, toggleCoupon, listRedemptions };
