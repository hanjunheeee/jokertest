'use strict';

// 게임 초대 끝내기 파일, 거절 · 둘 사이 취소 · 방 단위 취소
// gameInvite/index.js 거쳐 controllers/friend.controller.js(거절)·friend/blocks.js(차단)·socket/matchmaking/admission/release.js(방)가 부름
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { lockReceiver, expireDueInvites } = require('./guards');
const { INVITE_STATUS } = require('./constants');
const { toPublicInvite } = require('./view');
const { emitInviteUpdated } = require('./notify');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 받는 사람이 대기 초대 거절 (이미 끝난 초대면 그대로 돌려줌)
async function declineInvite(receiverId, inviteId) {
    const { db, now } = getDeps();
    const decided = await withTransaction(db, async (t) => {
        // 받는 계정 잠그고 시간 지난 초대 먼저 만료
        await lockReceiver(db, receiverId, t);
        await expireDueInvites(db, receiverId, now(), t);

        // 없거나 내 초대 아니면 똑같이 404 (남의 초대 있는지 안 드러냄)
        const row = await gameInviteRepository.lockInvite(db, inviteId, t);
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);
        // 대기 아니면 안 바꿈 (두 번 눌러도 안전)
        if (row.status !== INVITE_STATUS.PENDING) {
            return { row, changed: false };
        }

        // 여기부터 진짜 바뀜: 거절 표시 + revision 올림
        await gameInviteRepository.saveInvite(row, {
            status: INVITE_STATUS.DECLINED,
            end_reason: 'DECLINED',
            decided_at: now(),
            revision: row.revision + 1,
        }, t);

        return { row, changed: true };
    });

    // 바뀐 때만 커밋 뒤 두 사람에게 전송
    const publicInvite = toPublicInvite(decided.row);
    if (decided.changed) emitInviteUpdated([decided.row.sender_id, receiverId], publicInvite);
    return publicInvite;
}

// 두 사람 사이 대기 초대 전부 취소 (차단 트랜잭션 안에서 씀)
async function cancelPendingInvitesBetween(uuidA, uuidB, reason, options = {}) {
    // db는 넘긴 것 먼저 (바깥 트랜잭션과 같은 db)
    const db = options.db ?? getDeps().db;
    const now = getDeps().now();

    const rows = await gameInviteRepository.listBetween(db, { uuidA, uuidB, status: INVITE_STATUS.PENDING }, options.transaction);
    if (rows.length === 0) return [];

    // 여기부터 진짜 바뀜: 한 번에 취소 (바깥 트랜잭션 따라 같이 되돌려짐)
    await gameInviteRepository.endManyInTransaction(db, {
        ids: rows.map((row) => row.id), status: INVITE_STATUS.CANCELLED, endReason: reason, decidedAt: now,
    }, options.transaction);

    // 전송은 안 함 (관계 무효 사건 받고 화면이 초대 다시 받음)
    return rows.map((row) => row.id);
}

// 방이 없어지거나 시작되면 그 방 대기 초대 전부 취소하고 전송
async function cancelPendingInvitesForRoom(roomId, reason) {
    const { db, now } = getDeps();
    // 방 id 없으면 할 일 없음
    if (typeof roomId !== 'string' || roomId.length === 0) return [];

    const rows = await gameInviteRepository.listForRoom(db, { roomId, status: INVITE_STATUS.PENDING });
    if (rows.length === 0) return [];

    // 여기부터 진짜 바뀜: 한 번에 취소 (트랜잭션 없음)
    await gameInviteRepository.endMany(db, {
        ids: rows.map((row) => row.id), status: INVITE_STATUS.CANCELLED, endReason: reason, decidedAt: now(),
    });

    // 올라간 revision 보이게 하나씩 다시 읽어 전송
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
