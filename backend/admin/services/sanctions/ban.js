'use strict';

// 정지 파일, 기간·영구 정지 넣기 · 기간 바꾸기 · 커밋 뒤 바로 끊기 (정지 기록은 같은 트랜잭션)
// sanctions.controller.js(회원 상세)와 신고 처리(2-1 reports)가 banMember·disconnectAfterCommit을 씀
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');

const DAY_MS = 24 * 60 * 60 * 1000;

const defaultDb = () => require('../../../repositories/common/db');
const defaultDisconnect = (uuid) => require('../../../services/ops/disconnect').disconnectUser(uuid);

const fail = (message, status, code, details) => {
    const error = createError(message, status, code);
    if (details) error.details = details;
    return error;
};

// 지금 걸린 정지 조건 (로그인 쪽 checkActiveBan과 같은 규칙: 시작 시각 지남 + 영구거나 끝 시각 안 지남)
const activeBanWhere = (db, uuid, now) => {
    const { Op } = db.Sequelize;
    return {
        user_id: uuid,
        [Op.and]: [
            { [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }] },
            { [Op.or]: [{ is_permanent: true }, { end_at: { [Op.gt]: now } }] },
        ],
    };
};

// 정지 줄 → 응답 모양 (예: { id:3, reason:'욕설', isPermanent:false, startAt:'…', endAt:'…', bannedBy:'관리자 id' })
const banViewOf = (row) => ({
    id: row.id,
    reason: row.reason ?? null,
    isPermanent: Boolean(row.is_permanent),
    startAt: row.start_at ? new Date(row.start_at).toISOString() : null,
    endAt: row.end_at ? new Date(row.end_at).toISOString() : null,
    bannedBy: row.banned_by ?? null,
});

// 기간 정지는 지금부터 days일, 영구는 끝 시각 없음
const periodOf = ({ kind, days }, now) => (kind === 'PERMANENT'
    ? { is_permanent: true, end_at: null }
    : { is_permanent: false, end_at: new Date(now.getTime() + days * DAY_MS) });

// 회원 줄 잠금 (같은 회원 동시 정지가 두 줄 안 되게) → 없으면 404, 탈퇴면 409
const lockMember = async (db, uuid, transaction) => {
    const user = await db.User.findOne({
        where: { uuid }, paranoid: false, transaction, lock: transaction.LOCK.UPDATE, attributes: ['uuid', 'status', 'deleted_at'],
    });
    if (!user) throw fail('그런 회원이 없어요. UUID를 다시 확인해 주세요.', 404, 'MEMBER_NOT_FOUND');
    if (user.deleted_at || user.status === 'WITHDRAWN') throw fail('탈퇴한 회원이라 정지할 수 없어요.', 409, 'MEMBER_WITHDRAWN');
    return user;
};

// 정지 넣기 (바깥 트랜잭션 필수) → { ban }, 이미 정지 중이면 409 ALREADY_BANNED { banId }
// 끊기는 커밋 뒤 disconnectAfterCommit(uuid)로 따로 (커밋 전에 끊으면 다시 들어와 정지 판정을 못 볼 수 있음)
const banMember = async ({ req, uuid, kind, days, reason }, { transaction, db = defaultDb(), now = new Date() } = {}) => {
    if (!transaction) throw new Error('banMember는 바깥 트랜잭션 안에서만 부름');
    await lockMember(db, uuid, transaction);
    const current = await db.UserBan.findOne({ where: activeBanWhere(db, uuid, now), transaction, order: [['id', 'DESC']] });
    if (current) {
        throw fail('이미 정지 중이에요. 기간을 바꾸려면 "기간 바꾸기"를 써 주세요.', 409, 'ALREADY_BANNED', { banId: current.id });
    }
    const row = await db.UserBan.create({
        user_id: uuid, reason, banned_by: req.admin.id, start_at: now, created_at: now, ...periodOf({ kind, days }, now),
    }, { transaction });
    const ban = banViewOf(row);
    await audit.record({
        req, action: AUDIT_ACTIONS.BAN, targetType: 'member', targetId: uuid, before: null, after: { ban, kind, days: days ?? null }, reason,
    }, { transaction, db });
    return { ban };
};

// 커밋 뒤 끊기 → { disconnected, partial } (끊기가 실패해도 정지는 이미 저장됨 → 5초 주기 검사가 마저 끊음)
const disconnectAfterCommit = async (uuid, { disconnect = defaultDisconnect } = {}) => {
    try {
        const result = await disconnect(uuid);
        return { disconnected: result.disconnected, partial: Boolean(result.partial) };
    } catch (error) {
        console.error('[관리자 정지 뒤 끊기 실패]', error?.code ?? error?.name ?? 'Error');
        return { disconnected: 0, partial: true };
    }
};

// 정지 + 커밋 + 끊기 (회원 상세 "기간 정지"·"영구 정지") → { ban, disconnect }
const banAndDisconnect = async (input, { db = defaultDb(), disconnect } = {}) => {
    const { ban } = await db.sequelize.transaction((transaction) => banMember(input, { transaction, db }));
    return { ban, disconnect: await disconnectAfterCommit(input.uuid, { disconnect }) };
};

// 기간 바꾸기 → { ban } (지금 걸린 정지만, 바꾼 사유는 관리자 기록에만 · 플레이어에게 보이는 정지 사유는 그대로)
const updateBan = async ({ req, uuid, banId, kind, days, reason }, { db = defaultDb(), now = new Date() } = {}) => (
    db.sequelize.transaction(async (transaction) => {
        const row = await db.UserBan.findOne({ where: { id: banId, user_id: uuid }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) throw fail('그런 정지 기록이 없어요.', 404, 'BAN_NOT_FOUND');
        const active = await db.UserBan.count({ where: { id: banId, ...activeBanWhere(db, uuid, now) }, transaction });
        if (!active) throw fail('이미 끝났거나 풀린 정지예요.', 409, 'NOT_BANNED');
        const before = banViewOf(row);
        await row.update(periodOf({ kind, days }, now), { transaction });
        const ban = banViewOf(row);
        await audit.record({
            req, action: AUDIT_ACTIONS.BAN_UPDATE, targetType: 'member', targetId: uuid, before, after: { ban, kind, days: days ?? null }, reason,
        }, { transaction, db });
        return { ban };
    })
);

module.exports = {
    banMember, disconnectAfterCommit, banAndDisconnect, updateBan, activeBanWhere, banViewOf, DAY_MS,
};
