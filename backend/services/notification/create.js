'use strict';

// 알림 만들기 파일, 공통 만들기(중복이면 있던 것) + 종류별·환영 알림
// friend/requests.js·friend/gameInvite/create.js·achievement/grant.js가 바깥 트랜잭션 넘겨 부름, 환영은 socket/connection/notifications.js
const { createError } = require('../../utils/appError');
const { getDeps } = require('./deps');
const { NOTIFICATION_TYPES, friendRequestSourceKey, gameInviteSourceKey, achievementSourceKey, SYSTEM_WELCOME } = require('./constants');
const { toPublicNotification, emitNotificationCreated } = require('./notify');
const notificationRepository = require('../../repositories/notification');
const { withTransaction } = require('../../repositories/common');

// 출처 키로 한 번만 만듦, 이미 있으면 created false로 있던 것 돌려줌
const createNotification = async ({ userId, type, sourceKey, title, body, target = null }, options = {}) => {
    // db는 넘긴 것 먼저 (바깥 트랜잭션과 같은 db)
    const { newId, now } = getDeps();
    const db = options.db ?? getDeps().db;
    // 대상·출처 키 없으면 부른 쪽 잘못이라 500
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('알림 대상 계정이 없습니다.', 500);
    }
    if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
        throw createError('알림 원본 키가 없습니다.', 500);
    }

    const defaults = {
        id: newId(),
        user_id: userId,
        type,
        source_key: sourceKey,
        title,
        body,
        target,
        created_at: now(),
        read_at: null,
    };

    // 여기부터 진짜 바뀜: 같은 출처 키 없을 때만 만듦
    try {
        const [row, created] = await notificationRepository.findOrCreateBySource(db, { userId, sourceKey, defaults }, options.transaction);
        return { created, notification: toPublicNotification(row) };
    } catch (error) {
        // 동시에 같은 키 만들다 유일 제약 걸리면 있던 것 돌려줌 (다른 오류는 그대로 던짐)
        if (!notificationRepository.isDuplicateSourceError(error, db, userId, sourceKey)) throw error;
        const existing = await notificationRepository.findBySource(db, { userId, sourceKey }, options.transaction);
        return { created: false, notification: toPublicNotification(existing) };
    }
};

// 친구 신청 알림, 요청 id 숫자 아니면 안 만듦
const createForFriendRequest = async ({ receiverId, requestId, requesterNickname }, options = {}) => {
    if (!Number.isInteger(requestId)) return { created: false, notification: null };

    // 닉네임 없으면 기본 이름, 본문엔 40자까지
    const who = typeof requesterNickname === 'string' && requesterNickname.trim().length > 0
        ? requesterNickname.trim()
        : '알 수 없는 사용자';

    return createNotification({
        userId: receiverId,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST,
        sourceKey: friendRequestSourceKey(requestId),
        title: '새 친구 요청',
        body: `${who.slice(0, 40)} 님이 친구 요청을 보냈습니다.`,
        target: { kind: 'friend-request', requestId },
    }, options);
};

// 게임 초대 알림, 초대 id 없으면 안 만듦
const createForGameInvite = async ({ receiverId, inviteId, senderNickname }, options = {}) => {
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        return { created: false, notification: null };
    }

    // 닉네임 없으면 기본 이름, 본문엔 40자까지
    const who = typeof senderNickname === 'string' && senderNickname.trim().length > 0
        ? senderNickname.trim()
        : '알 수 없는 사용자';

    return createNotification({
        userId: receiverId,
        type: NOTIFICATION_TYPES.GAME_INVITE,
        sourceKey: gameInviteSourceKey(inviteId),
        title: '게임 초대',
        body: `${who.slice(0, 40)} 님이 대기방으로 초대했습니다.`,
        target: { kind: 'game-invite', inviteId },
    }, options);
};

// 업적 달성 알림, 업적 id 없으면 안 만듦
const createForAchievement = async ({ userId, achievementId }, options = {}) => {
    if (typeof achievementId !== 'string' || achievementId.length === 0) {
        return { created: false, notification: null };
    }

    return createNotification({
        userId,
        type: NOTIFICATION_TYPES.ACHIEVEMENT,
        sourceKey: achievementSourceKey(achievementId),
        title: '업적 달성',
        body: '새 업적을 달성해 보상을 받았습니다. 기억의 서고에서 확인하세요.',
        target: { kind: 'achievement', achievementId },
    }, options);
};

// 환영 알림 없으면 하나 만들고 새로 만들었을 때만 보냄
const ensureSystemWelcome = async (userId) => {
    // 계정 없으면 안 만듦
    if (typeof userId !== 'string' || userId.length === 0) {
        return { created: false, notification: null };
    }

    // 바깥 트랜잭션 없는 호출이라 직접 열어 만듦
    const { db } = getDeps();
    const result = await withTransaction(db, async (transaction) => createNotification({
        userId,
        type: SYSTEM_WELCOME.type,
        sourceKey: SYSTEM_WELCOME.sourceKey,
        title: SYSTEM_WELCOME.title,
        body: SYSTEM_WELCOME.body,
        target: SYSTEM_WELCOME.target,
    }, { transaction }));

    // 새로 만든 때만 커밋 뒤 전송 (연결마다 다시 불려도 소리 한 번)
    if (result.created) emitNotificationCreated(userId, result.notification);
    return result;
};

module.exports = {
    createNotification,
    createForFriendRequest,
    createForGameInvite,
    createForAchievement,
    ensureSystemWelcome,
};
