'use strict';

// 게임 초대 조회 파일, 받은 초대 모음 · 초대 하나
// 조회 전에 만료 정리부터 함
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { lockReceiver, expireDueInvites } = require('./guards');
const { INVITE_STATUS } = require('./constants');
const { toPublicInvite } = require('./view');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 받은 대기 초대 목록 + 가장 새 순번
async function getReceiverSnapshot(receiverId) {
    const { db, now } = getDeps();
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        return { invites: [], cursor: '0' };
    }

    return await withTransaction(db, async (t) => {
        await lockReceiver(db, receiverId, t);
        await expireDueInvites(db, receiverId, now(), t);

        const rows = await gameInviteRepository.listReceivedWithSender(db, { receiverId, status: INVITE_STATUS.PENDING }, t);

        const newest = await gameInviteRepository.findNewestForReceiver(db, receiverId, t);

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

    return await withTransaction(db, async (t) => {
        const row = await gameInviteRepository.findWithSender(db, inviteId, t);
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== viewerId && row.sender_id !== viewerId) {
            throw createError('초대를 찾을 수 없습니다.', 404);
        }

        if (row.status === INVITE_STATUS.PENDING && row.expires_at.getTime() <= now().getTime()) {
            await lockReceiver(db, row.receiver_id, t);
            await expireDueInvites(db, row.receiver_id, now(), t);
            await gameInviteRepository.reloadInvite(row, t);
        }

        return toPublicInvite(row);
    });
}

module.exports = {
    getReceiverSnapshot,
    getInviteForUser,
};
