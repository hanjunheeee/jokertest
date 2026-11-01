'use strict';

// 알림 만들기 파일, 공통 만들기(중복이면 있던 것) + 종류별·환영 알림
// 친구·초대·업적 서비스가 바깥 트랜잭션 넘겨서 부름
const { createError } = require('../../utils/appError');
const { getDeps } = require('./deps');
const { toPublicNotification } = require('./view');
const { NOTIFICATION_TYPES, friendRequestSourceKey, gameInviteSourceKey, achievementSourceKey, SYSTEM_WELCOME } = require('./constants');
const { emitNotificationCreated } = require('./notify');

// 같은 사용자·출처 키 유일 제약에 걸린 건지 (다른 유일 오류는 아님)
const isDuplicateNotification = (error, db, userId, sourceKey) => {
    const UniqueConstraintError = db?.Sequelize?.UniqueConstraintError;
    const isUniqueError = UniqueConstraintError
        ? error instanceof UniqueConstraintError
        : error?.name === 'SequelizeUniqueConstraintError';
    if (!isUniqueError) return false;
    const constraint = error?.parent?.constraint ?? error?.original?.constraint;
    if (constraint === 'notifications_user_source_unique') return true;
    if (Object.prototype.hasOwnProperty.call(error?.fields ?? {}, 'notifications_user_source_unique')) return true;
    return error?.fields?.user_id === userId && error?.fields?.source_key === sourceKey;
};

// 출처 키로 한 번만 만듦, 이미 있으면 created false로 있던 것 돌려줌
const createNotification = async ({ userId, type, sourceKey, title, body, target = null }, options = {}) => {
    const { newId, now } = getDeps();
    const db = options.db ?? getDeps().db;
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

    try {
        const [row, created] = await db.Notification.findOrCreate({
            where: { user_id: userId, source_key: sourceKey },
            defaults,
            transaction: options.transaction,
        });
        return { created, notification: toPublicNotification(row) };
    } catch (error) {
        if (!isDuplicateNotification(error, db, userId, sourceKey)) throw error;
        const existing = await db.Notification.findOne({
            where: { user_id: userId, source_key: sourceKey },
            transaction: options.transaction,
        });
        return { created: false, notification: toPublicNotification(existing) };
    }
};

// 친구 신청 알림, 요청 id 숫자 아니면 안 만듦
const createFriendRequestNotification = async ({ receiverId, requestId, requesterNickname }, options = {}) => {
    if (!Number.isInteger(requestId)) return { created: false, notification: null };

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

// 게임 초대 알림
const createGameInviteNotification = async ({ receiverId, inviteId, senderNickname }, options = {}) => {
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        return { created: false, notification: null };
    }

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

// 업적 달성 알림
const createAchievementNotification = async ({ userId, achievementId }, options = {}) => {
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
    if (typeof userId !== 'string' || userId.length === 0) {
        return { created: false, notification: null };
    }

    const { db } = getDeps();
    const result = await db.sequelize.transaction(async (transaction) => createNotification({
        userId,
        type: SYSTEM_WELCOME.type,
        sourceKey: SYSTEM_WELCOME.sourceKey,
        title: SYSTEM_WELCOME.title,
        body: SYSTEM_WELCOME.body,
        target: SYSTEM_WELCOME.target,
    }, { transaction }));

    if (result.created) emitNotificationCreated(userId, result.notification);
    return result;
};

module.exports = {
    createNotification,
    createFriendRequestNotification,
    createGameInviteNotification,
    createAchievementNotification,
    ensureSystemWelcome,
};
