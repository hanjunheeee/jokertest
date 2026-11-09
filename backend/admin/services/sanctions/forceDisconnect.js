'use strict';

// 강제 접속 종료 파일, 정지 없이 지금 접속만 끊음 (다시 들어오는 건 됨) + 끊은 결과를 관리자 기록에
// sanctions.controller.js가 부름, 끊기는 기존 services/ops/disconnect.js 그대로 (전 Node)
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');

const defaultDb = () => require('../../../repositories/common/db');
const defaultDisconnect = (uuid) => require('../../../services/ops/disconnect').disconnectUser(uuid);

// 강제 접속 종료 → { disconnected, partial } (DB 밖 일이라 결과를 기록 after에 실음)
const forceDisconnectMember = async ({ req, uuid, reason }, { db = defaultDb(), disconnect = defaultDisconnect } = {}) => {
    const user = await db.User.findOne({ where: { uuid }, paranoid: false, attributes: ['uuid'] });
    if (!user) throw createError('그런 회원이 없어요. UUID를 다시 확인해 주세요.', 404, 'MEMBER_NOT_FOUND');
    const result = await disconnect(uuid);
    const outcome = { disconnected: result.disconnected, partial: Boolean(result.partial) };
    await audit.record({
        req, action: AUDIT_ACTIONS.FORCE_DISCONNECT, targetType: 'member', targetId: uuid, after: { ...outcome, code: result.code }, reason,
    }, { db });
    return outcome;
};

module.exports = { forceDisconnectMember };
