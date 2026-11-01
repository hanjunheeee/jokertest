'use strict';

const crypto = require('node:crypto');
const { Op } = require('sequelize');

const { createError } = require('../utils/appError');

const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../models'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        try {
            return require('../socket/emitter').emitToUser;
        } catch {
            return null;
        }
    },
    get newId() { return overrides.newId ?? (() => crypto.randomUUID()); },
    get now() { return overrides.now ?? (() => new Date()); },
});

let deps = buildDeps();

const NOTIFICATION_TYPES = Object.freeze({
    FRIEND_REQUEST: 'friend-request',
    GAME_INVITE: 'game-invite',
    ACHIEVEMENT: 'achievement',
    SYSTEM: 'system',
});

const SYSTEM_WELCOME = Object.freeze({
    sourceKey: 'system:notifications-available:v1',
    type: NOTIFICATION_TYPES.SYSTEM,
    title: '알림 기능 안내',
    body: '친구 요청과 업적 보상은 알림에서 확인하고, 표시 설정은 환경설정에서 변경할 수 있습니다.',
    target: { kind: 'settings' },
});

const friendRequestSourceKey = (requestId) => `friend-request:${requestId}:received`;

const achievementSourceKey = (achievementId) => `achievement:${achievementId}:granted`;

const gameInviteSourceKey = (inviteId) => `game-invite:${inviteId}:received`;

const toPublicNotification = (row) => {
    if (row === null || row === undefined) return null;
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        id: plain.id,
        type: plain.type,
        sourceKey: plain.source_key,
        title: plain.title,
        body: plain.body,
        target: plain.target ?? null,
        createdAt: plain.created_at,
        readAt: plain.read_at ?? null,
    };
};

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

const createNotification = async ({ userId, type, sourceKey, title, body, target = null }, options = {}) => {
    const { newId, now } = deps;
    const db = options.db ?? deps.db;
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

const emitNotificationCreated = (userId, notification) => {
    if (notification === null || notification === undefined) return;
    try {
        const emit = deps.emitToUser;
        if (typeof emit !== 'function') return;

        const payload = { notification };
        if (notification.type === NOTIFICATION_TYPES.SYSTEM) {
            payload.sfxEvent = {
                kind: 'system-notification',
                eventId: `notification:${notification.id}`,
                accountId: userId,
                origin: 'live',
            };
        }
        emit(userId, 'notification_created', payload);
    } catch (error) {
        console.error('[알림 전달 실패]', { code: 'NOTIFICATION_EMIT_ERROR', userId, notificationId: notification?.id });
    }
};

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

const ensureSystemWelcome = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) {
        return { created: false, notification: null };
    }

    const { db } = deps;
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

const listForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];
    const { db } = deps;
    const rows = await db.Notification.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC'], ['id', 'DESC']],
    });
    return rows.map(toPublicNotification);
};

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const markRead = async (userId, notificationId) => {
    if (typeof notificationId !== 'string' || !UUID_PATTERN.test(notificationId)) {
        throw createError('유효하지 않은 알림 id입니다.', 400);
    }

    const { db, now } = deps;
    return db.sequelize.transaction(async (transaction) => {
        const row = await db.Notification.findOne({
            where: { id: notificationId, user_id: userId },
            transaction,
        });
        if (!row) throw createError('알림을 찾을 수 없습니다.', 404);

        if (row.read_at === null || row.read_at === undefined) {
            await db.Notification.update(
                { read_at: now() },
                { where: { id: notificationId, user_id: userId, read_at: null }, transaction },
            );
        }

        const confirmed = await db.Notification.findOne({
            where: { id: notificationId, user_id: userId },
            transaction,
        });
        return toPublicNotification(confirmed);
    });
};

const deleteReadForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('알림 대상 계정이 없습니다.', 500);
    }

    const { db } = deps;
    const deletedCount = await db.Notification.destroy({
        where: {
            user_id: userId,
            read_at: { [Op.ne]: null },
        },
    });

    return { deletedCount };
};

module.exports = {
    NOTIFICATION_TYPES,
    SYSTEM_WELCOME,
    friendRequestSourceKey,
    gameInviteSourceKey,
    achievementSourceKey,
    toPublicNotification,
    createNotification,
    createFriendRequestNotification,
    createGameInviteNotification,
    createAchievementNotification,
    emitNotificationCreated,
    ensureSystemWelcome,
    listForUser,
    markRead,
    deleteReadForUser,
    __internal: {
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
