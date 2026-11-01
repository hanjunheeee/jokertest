'use strict';

// 게임 초대 조회 파일, 받은 초대 모음 · 초대 하나
// 조회 전에 만료 정리부터 함
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { lockReceiver, expireDueInvitesForReceiver } = require('./guards');
const { INVITE_STATUS } = require('./constants');
const { toPublicInvite } = require('./view');

// 받은 대기 초대 목록 + 가장 새 순번
async function getReceiverSnapshot(receiverId) {
    const { db, now } = getDeps();
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        return { invites: [], cursor: '0' };
    }

    return await db.sequelize.transaction(async (t) => {
        await lockReceiver(db, receiverId, t);
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const rows = await db.GameInvite.findAll({
            where: { receiver_id: receiverId, status: INVITE_STATUS.PENDING },
            include: [{ model: db.User, as: 'InviteSender', attributes: ['uuid', 'nickname'] }],
            order: [['creation_seq', 'ASC']],
            transaction: t,
        });

        const newest = await db.GameInvite.findOne({
            where: { receiver_id: receiverId },
            attributes: ['creation_seq'],
            order: [['creation_seq', 'DESC']],
            transaction: t,
        });

        return {
            invites: rows.map((row) => toPublicInvite(row)),
            cursor: newest ? String(newest.creation_seq) : '0',
        };
    });
}

// 보낸 사람·받는 사람만 볼 수 있음
async function getInviteForUser(viewerId, inviteId) {
    const { db, now } = getDeps();
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        throw createError('유효하지 않은 초대 id입니다.', 400);
    }

    return await db.sequelize.transaction(async (t) => {
        const row = await db.GameInvite.findOne({
            where: { id: inviteId },
            include: [{ model: db.User, as: 'InviteSender', attributes: ['uuid', 'nickname'] }],
            transaction: t,
        });
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== viewerId && row.sender_id !== viewerId) {
            throw createError('초대를 찾을 수 없습니다.', 404);
        }

        if (row.status === INVITE_STATUS.PENDING && row.expires_at.getTime() <= now().getTime()) {
            await lockReceiver(db, row.receiver_id, t);
            await expireDueInvitesForReceiver(db, row.receiver_id, now(), t);
            await row.reload({ transaction: t });
        }

        return toPublicInvite(row);
    });
}

module.exports = {
    getReceiverSnapshot,
    getInviteForUser,
};
