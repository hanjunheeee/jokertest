'use strict';

// 게임 초대 끝내기 파일, 거절 · 둘 사이 취소 · 방 단위 취소
// 컨트롤러·친구 차단·방 나가기가 부름
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { lockReceiver, expireDueInvitesForReceiver } = require('./guards');
const { INVITE_STATUS } = require('./constants');
const { toPublicInvite } = require('./view');
const { emitInviteUpdated } = require('./notify');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 받는 사람이 대기 초대 거절
async function declineInvite(receiverId, inviteId) {
    const { db, now } = getDeps();
    const decided = await withTransaction(db, async (t) => {
        await lockReceiver(db, receiverId, t);
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const row = await gameInviteRepository.lockInvite(db, inviteId, t);
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.status !== INVITE_STATUS.PENDING) {
            return { row, changed: false };
        }

        await gameInviteRepository.saveInvite(row, {
            status: INVITE_STATUS.DECLINED,
            end_reason: 'DECLINED',
            decided_at: now(),
            revision: row.revision + 1,
        }, t);

        return { row, changed: true };
    });

    const publicInvite = toPublicInvite(decided.row);
    if (decided.changed) emitInviteUpdated([decided.row.sender_id, receiverId], publicInvite);
    return publicInvite;
}

// 두 사람 사이 대기 초대 전부 취소 (바깥 트랜잭션 받음)
async function cancelPendingInvitesBetween(uuidA, uuidB, reason, options = {}) {
    const db = options.db ?? getDeps().db;
    const now = getDeps().now();

    const rows = await gameInviteRepository.listBetween(db, { uuidA, uuidB, status: INVITE_STATUS.PENDING }, options.transaction);
    if (rows.length === 0) return [];

    await gameInviteRepository.endManyInTransaction(db, {
        ids: rows.map((row) => row.id), status: INVITE_STATUS.CANCELLED, endReason: reason, decidedAt: now,
    }, options.transaction);

    return rows.map((row) => row.id);
}

// 방이 없어지면 그 방 초대 전부 취소하고 알림
async function cancelPendingInvitesForRoom(roomId, reason) {
    const { db, now } = getDeps();
    if (typeof roomId !== 'string' || roomId.length === 0) return [];

    const rows = await gameInviteRepository.listForRoom(db, { roomId, status: INVITE_STATUS.PENDING });
    if (rows.length === 0) return [];

    await gameInviteRepository.endMany(db, {
        ids: rows.map((row) => row.id), status: INVITE_STATUS.CANCELLED, endReason: reason, decidedAt: now(),
    });

    for (const row of rows) {
        const fresh = await gameInviteRepository.findInvite(db, row.id);
        emitInviteUpdated([row.receiver_id, row.sender_id], toPublicInvite(fresh));
    }
    return rows.map((row) => row.id);
}

module.exports = {
    declineInvite,
    cancelPendingInvitesBetween,
    cancelPendingInvitesForRoom,
};
