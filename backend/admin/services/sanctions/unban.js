'use strict';

// 제재 해제 파일, 지금 걸린 정지를 전부 풀고 해제 사유·해제한 관리자 남김 (줄은 안 지움)
// sanctions.controller.js가 부름, 끝 시각을 지금으로 당겨서 로그인 쪽 정지 판정 코드는 그대로 둠
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const { activeBanWhere, banViewOf } = require('./ban');

const defaultDb = () => require('../../../repositories/common/db');

// 해제 → { liftedCount }, 걸린 정지 없으면 409 NOT_BANNED
const unbanMember = async ({ req, uuid, reason }, { db = defaultDb(), now = new Date() } = {}) => (
    db.sequelize.transaction(async (transaction) => {
        const rows = await db.UserBan.findAll({ where: activeBanWhere(db, uuid, now), transaction, lock: transaction.LOCK.UPDATE });
        if (rows.length === 0) throw createError('지금 정지 중이 아니에요.', 409, 'NOT_BANNED');
        const before = rows.map(banViewOf);
        await db.UserBan.update({
            end_at: now, is_permanent: false, lifted_at: now, lifted_by: req.admin.id, lift_reason: reason,
        }, { where: { id: rows.map((row) => row.id) }, transaction });
        await audit.record({
            req, action: AUDIT_ACTIONS.UNBAN, targetType: 'member', targetId: uuid, before, after: { liftedCount: rows.length }, reason,
        }, { transaction, db });
        return { liftedCount: rows.length };
    })
);

module.exports = { unbanMember };
