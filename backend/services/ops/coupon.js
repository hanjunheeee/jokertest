'use strict';

// 쿠폰 사용 파일, 코드 검사 → 쿠폰 줄 잠금 → 기간·횟수·한 사람 한 번 → 사용 기록 + 장부 지급을 한 트랜잭션
// controllers/ops/coupon.js가 부름, 보상은 기존 장부 함수로 (참조 id = coupon:<사용 id>, 실패하면 사용 기록도 되돌림)
const crypto = require('crypto');
const { createError } = require('../../utils/appError');
const { withTransaction, isUniqueConstraintName } = require('../../repositories/common');

// 코드 모양: 영문 대문자·숫자·- 4~40자 (소문자로 와도 대문자로 바꿔 봄)
const COUPON_CODE_PATTERN = /^[A-Z0-9-]{4,40}$/;
const REWARD_TYPES = Object.freeze(['GOLD', 'DIAMOND']);
const COUPON_LEDGER_REASON = 'COUPON_REWARD';

const couponReferenceEventId = (redemptionId) => `coupon:${redemptionId}`;

const normalizeCouponCode = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

const defaultDeps = () => ({
    db: require('../../repositories/common/db'),
    applyLedgerTransaction: require('../economy').applyLedgerTransaction,
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
});

const plainOf = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);
const toTime = (value) => (value ? new Date(value).getTime() : null);

// 쿠폰이 지금 쓸 수 있는지 (안 되면 코드 붙여 던짐)
const assertUsable = (coupon, nowMs) => {
    if (!coupon) throw createError('쿠폰을 찾을 수 없습니다.', 404, 'COUPON_NOT_FOUND');
    if (!(coupon.is_active === true || coupon.is_active === 1)) {
        throw createError('사용이 중지된 쿠폰입니다.', 409, 'COUPON_INACTIVE');
    }
    const startsAt = toTime(coupon.starts_at);
    if (startsAt !== null && startsAt > nowMs) throw createError('아직 사용할 수 없는 쿠폰입니다.', 409, 'COUPON_NOT_STARTED');
    const endsAt = toTime(coupon.ends_at);
    if (endsAt !== null && endsAt <= nowMs) throw createError('기간이 끝난 쿠폰입니다.', 409, 'COUPON_EXPIRED');
    if (!REWARD_TYPES.includes(coupon.reward_type) || !Number.isInteger(coupon.reward_amount) || coupon.reward_amount <= 0) {
        // 관리자 서버가 잘못 넣은 쿠폰 (사용자 잘못 아님)
        throw createError('쿠폰 보상 설정이 올바르지 않습니다.', 409, 'COUPON_MISCONFIGURED');
    }
};

const alreadyRedeemed = () => createError('이미 사용한 쿠폰입니다.', 409, 'COUPON_ALREADY_REDEEMED');

// 쿠폰 사용
const redeemCoupon = async ({ userId, code }, deps = defaultDeps()) => {
    const normalized = normalizeCouponCode(code);
    if (!COUPON_CODE_PATTERN.test(normalized)) {
        throw createError('쿠폰 코드 형식이 올바르지 않습니다.', 400, 'INVALID_COUPON_CODE');
    }
    const { db } = deps;

    try {
        return await withTransaction(db, async (t) => {
            // 같은 쿠폰 동시 사용은 이 잠금에서 한 줄로 섬 (횟수 넘김 막기)
            const coupon = plainOf(await db.Coupon.findOne({ where: { code: normalized }, transaction: t, lock: t.LOCK.UPDATE }));
            const now = deps.now();
            assertUsable(coupon, now.getTime());

            const existing = await db.CouponRedemption.findOne({ where: { coupon_id: coupon.id, user_id: userId }, transaction: t });
            if (existing) throw alreadyRedeemed();
            if (coupon.max_uses !== null && coupon.max_uses !== undefined && coupon.used_count >= coupon.max_uses) {
                throw createError('모두 사용된 쿠폰입니다.', 409, 'COUPON_EXHAUSTED');
            }

            // 여기부터 진짜 바뀜: 사용 기록 → 쓴 횟수 → 장부 (하나라도 실패하면 다 되돌림)
            const redemptionId = deps.newId();
            await db.CouponRedemption.create({ id: redemptionId, coupon_id: coupon.id, user_id: userId, redeemed_at: now }, { transaction: t });
            await db.Coupon.update(
                { used_count: coupon.used_count + 1, updated_at: now },
                { where: { id: coupon.id }, transaction: t },
            );
            const ledger = await deps.applyLedgerTransaction(db, {
                userId,
                reason: COUPON_LEDGER_REASON,
                currency: coupon.reward_type,
                amount: coupon.reward_amount,
                referenceEventId: couponReferenceEventId(redemptionId),
            }, { transaction: t });

            return {
                redemptionId,
                code: normalized,
                reward: { currency: coupon.reward_type, amount: coupon.reward_amount },
                balanceAfter: ledger?.ledgerEntry?.balance_after ?? null,
            };
        });
    } catch (error) {
        // 같은 사람 동시 요청이 앞 검사를 같이 지나쳐도 유일 제약이 막음
        // (참조 id는 새 uuid라 장부 쪽 유일 제약은 안 걸림 → 유일 제약이면 사용 기록 쪽)
        if (isUniqueConstraintName(error)) throw alreadyRedeemed();
        throw error;
    }
};

module.exports = {
    COUPON_CODE_PATTERN,
    REWARD_TYPES,
    COUPON_LEDGER_REASON,
    couponReferenceEventId,
    normalizeCouponCode,
    redeemCoupon,
};
