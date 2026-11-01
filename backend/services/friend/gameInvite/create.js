'use strict';

// 게임 초대 만들기 파일
// 보낸 사람 방·받는 사람 상태·차단·같은 요청 확인 뒤 초대 하나 만들고 알림
const friendshipRepository = require('../../../repositories/friend/friendship');
const notificationService = require('../../notification');
const { createError } = require('../../../utils/appError');
const { getDeps, getRoomAccess } = require('./deps');
const { INVITE_TTL_MS, INVITE_STATUS } = require('./constants');
const { isBlockedBetween } = require('./guards');
const { toPublicInvite } = require('./view');
const { emitInviteReceived } = require('./notify');
const userLookup = require('../../../repositories/user/lookup');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 같은 만들기 키면 처음 초대 그대로, 대기 초대 있으면 거절, 다 통과하면 만들고 받음 전송
async function createInvite({ senderId, receiverId, creationKey }) {
    const { db, now } = getDeps();

    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        throw createError('초대할 상대를 지정해야 합니다.', 400);
    }
    if (receiverId === senderId) {
        throw createError('자기 자신을 초대할 수 없습니다.', 400);
    }
    if (typeof creationKey !== 'string' || creationKey.trim().length === 0 || creationKey.length > 120) {
        throw createError('초대 생성 키가 필요합니다.', 400);
    }
    const normalizedKey = creationKey.trim();

    const requireSenderRoom = (expected = null) => {
        const currentId = getRoomAccess().getRoomIdForUser(senderId);
        const current = currentId ? getRoomAccess().describeRoomForInvite(currentId) : null;
        if (!current) throw createError('초대를 보낼 대기방이 없습니다.', 409);
        if (current.isFull) throw createError('방이 가득 차 초대를 보낼 수 없습니다.', 409);
        if (expected !== null
            && (current.roomId !== expected.roomId || current.roomInstanceId !== expected.roomInstanceId)) {
            throw createError('대기방 상태가 바뀌어 초대를 보내지 못했습니다.', 409, 'ROOM_STATE_CHANGED');
        }
        return current;
    };

    requireSenderRoom();

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + INVITE_TTL_MS);
    const bootEpoch = getRoomAccess().bootEpoch;

    const result = await withTransaction(db, async (t) => {
        const locked = await friendshipRepository.lockAccountsInOrder([senderId, receiverId], { transaction: t });
        const lockedByUuid = new Map(locked.filter(Boolean).map((row) => [row.uuid, row]));
        if (!lockedByUuid.get(senderId)) throw createError('사용자를 찾을 수 없습니다.', 404);
        const receiver = lockedByUuid.get(receiverId);
        if (!receiver) throw createError('초대할 사용자를 찾을 수 없습니다.', 404);
        if (receiver.status !== 'ACTIVE') throw createError('초대할 수 없는 계정입니다.', 403);

        const room = requireSenderRoom();

        const existing = await gameInviteRepository.findByCreationKey(db, { senderId, creationKey: normalizedKey }, t);
        if (existing) {
            if (existing.receiver_id !== receiverId || existing.room_id !== room.roomId) {
                throw createError('같은 생성 키로 다른 초대를 보낼 수 없습니다.', 409);
            }
            return { invite: existing, created: false, notification: null, senderNickname: null };
        }

        if (await isBlockedBetween(senderId, receiverId, { transaction: t })) {
            throw createError('차단된 사용자에게는 게임 초대를 보낼 수 없습니다.', 403);
        }

        const friendship = await friendshipRepository.findExistingFriendship(senderId, receiverId, { transaction: t });
        if (!friendship || friendship.status !== 'ACCEPTED') {
            throw createError('친구만 게임에 초대할 수 있습니다.', 403);
        }

        const livePending = await gameInviteRepository.findLivePending(db, {
            senderId,
            receiverId,
            roomId: room.roomId,
            roomInstanceId: room.roomInstanceId,
            bootEpoch,
            status: INVITE_STATUS.PENDING,
            after: createdAt,
        }, t);
        if (livePending) {
            return { invite: livePending, created: false, notification: null, senderNickname: null };
        }

        const availability = getRoomAccess().describeReceiverAvailability(receiverId);
        if (!availability.available) {
            throw createError('지금은 상대를 초대할 수 없습니다.', 409, availability.code);
        }

        const sender = await userLookup.findNickname(db, senderId, t);

        requireSenderRoom(room);

        const invite = await gameInviteRepository.createInviteRow(db, {
            id: getDeps().newId(),
            sender_id: senderId,
            receiver_id: receiverId,
            room_id: room.roomId,
            room_instance_id: room.roomInstanceId,
            boot_epoch: bootEpoch,
            creation_key: normalizedKey,
            revision: 1,
            status: INVITE_STATUS.PENDING,
            created_at: createdAt,
            expires_at: expiresAt,
        }, t);

        const notificationResult = await notificationService.createForGameInvite({
            receiverId,
            inviteId: invite.id,
            senderNickname: sender?.nickname ?? null,
        }, { db, transaction: t });

        return {
            invite,
            created: true,
            notification: notificationResult.created ? notificationResult.notification : null,
            senderNickname: sender?.nickname ?? null,
        };
    });

    const publicInvite = toPublicInvite(result.invite, result.senderNickname);

    if (result.created) {
        emitInviteReceived(receiverId, publicInvite);
        if (result.notification !== null) {
            notificationService.emitNotificationCreated(receiverId, result.notification);
        }
    }

    return { invite: publicInvite, created: result.created };
}

module.exports = {
    createInvite,
};
