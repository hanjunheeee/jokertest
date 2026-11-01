'use strict';

// 게임 초대 만들기 파일, 방·계정·차단·친구·중복 확인 뒤 초대 하나 + 받는 사람 알림
// controllers/friend.controller.js가 gameInvite/index.js 거쳐 부름
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

// 초대 만들기: 같은 키·살아 있는 대기 초대면 그것 그대로, 아니면 새로 만들고 전송
async function createInvite({ senderId, receiverId, creationKey }) {
    const { db, now } = getDeps();

    // 받는 사람·만들기 키 모양 확인, 나 자신이면 거절
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

    // 보낸 사람 대기방 확인: 없음·꽉 참이면 409, 기대한 방과 다르면 ROOM_STATE_CHANGED
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

    // 트랜잭션 열기 전에 한 번 (방 없으면 DB 안 감)
    requireSenderRoom();

    // 부팅 epoch 같이 저장 (서버 다시 켜지면 옛 초대 수락 거절용)
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + INVITE_TTL_MS);
    const bootEpoch = getRoomAccess().bootEpoch;

    const result = await withTransaction(db, async (t) => {
        // 두 계정 순서대로 잠금, 없는 계정 404 · 받는 사람 활성 아니면 403
        const locked = await friendshipRepository.lockAccountsInOrder([senderId, receiverId], { transaction: t });
        const lockedByUuid = new Map(locked.filter(Boolean).map((row) => [row.uuid, row]));
        if (!lockedByUuid.get(senderId)) throw createError('사용자를 찾을 수 없습니다.', 404);
        const receiver = lockedByUuid.get(receiverId);
        if (!receiver) throw createError('초대할 사용자를 찾을 수 없습니다.', 404);
        if (receiver.status !== 'ACTIVE') throw createError('초대할 수 없는 계정입니다.', 403);

        // 잠그는 사이 방 바뀌었을 수 있어 다시 확인
        const room = requireSenderRoom();

        // 같은 만들기 키면 처음 초대 그대로 (다시 보내도 안전), 다른 상대·방이면 409
        const existing = await gameInviteRepository.findByCreationKey(db, { senderId, creationKey: normalizedKey }, t);
        if (existing) {
            if (existing.receiver_id !== receiverId || existing.room_id !== room.roomId) {
                throw createError('같은 생성 키로 다른 초대를 보낼 수 없습니다.', 409);
            }
            return { invite: existing, created: false, notification: null, senderNickname: null };
        }

        // 차단이면 403, 수락된 친구 아니면 403
        if (await isBlockedBetween(senderId, receiverId, { transaction: t })) {
            throw createError('차단된 사용자에게는 게임 초대를 보낼 수 없습니다.', 403);
        }

        const friendship = await friendshipRepository.findExistingFriendship(senderId, receiverId, { transaction: t });
        if (!friendship || friendship.status !== 'ACCEPTED') {
            throw createError('친구만 게임에 초대할 수 있습니다.', 403);
        }

        // 같은 방·부팅에 살아 있는 대기 초대 있으면 그것 그대로 (중복 초대 막기)
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

        // 받는 사람이 지금 초대 받을 수 있는지 (판정은 matchmaking 방 접근자가 함)
        const availability = getRoomAccess().describeReceiverAvailability(receiverId);
        if (!availability.available) {
            throw createError('지금은 상대를 초대할 수 없습니다.', 409, availability.code);
        }

        const sender = await userLookup.findNickname(db, senderId, t);

        // 닉네임 읽는 사이 방 바뀌었으면 거절
        requireSenderRoom(room);

        // 여기부터 진짜 바뀜: 초대 행 → 받는 사람 알림 (한 트랜잭션)
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

    // 새로 만든 때만 커밋 뒤 받음 사건·알림 전송
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
