'use strict';

// 게임 초대 조회 파일, 받은 초대 모음 · 초대 하나
// controllers/friend.controller.js가 gameInvite/index.js 거쳐 부름, 읽기 전에 만료부터 정리
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { lockReceiver, expireDueInvites } = require('./guards');
const { INVITE_STATUS } = require('./constants');
const { toPublicInvite } = require('./view');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 받은 대기 초대 목록 + 가장 새 순번 (화면이 새 초대 가려냄)
async function getReceiverSnapshot(receiverId) {
    const { db, now } = getDeps();
    // 받는 사람 없으면 빈 목록
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        return { invites: [], cursor: '0' };
    }

    return await withTransaction(db, async (t) => {
        // 받는 계정 잠그고 시간 지난 초대 먼저 만료
        await lockReceiver(db, receiverId, t);
        await expireDueInvites(db, receiverId, now(), t);

        const rows = await gameInviteRepository.listReceivedWithSender(db, { receiverId, status: INVITE_STATUS.PENDING }, t);

        // 순번은 끝난 초대까지 보고 가장 새 것
        const newest = await gameInviteRepository.findNewestForReceiver(db, receiverId, t);

        return {
            invites: rows.map((row) => toPublicInvite(row)),
            cursor: newest ? String(newest.creation_seq) : '0',
        };
    });
}

// 초대 하나 보기, 보낸 사람·받는 사람만 (남이면 404)
async function getInviteForUser(viewerId, inviteId) {
    const { db, now } = getDeps();
    // 초대 id 없으면 400
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        throw createError('유효하지 않은 초대 id입니다.', 400);
    }

    return await withTransaction(db, async (t) => {
        // 없거나 남의 초대면 똑같이 404 (있는지 안 드러냄)
        const row = await gameInviteRepository.findWithSender(db, inviteId, t);
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== viewerId && row.sender_id !== viewerId) {
            throw createError('초대를 찾을 수 없습니다.', 404);
        }

        // 대기인데 시간 지났으면 만료 정리 뒤 다시 읽음
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
