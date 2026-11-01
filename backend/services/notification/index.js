'use strict';

// 알림 입구, 알림 상수·모양·만들기·관리 + 시험 손잡이 내보냄
// controllers/notification.controller.js·friend/requests.js·friend/gameInvite(create·notify)·achievement/deps.js·socket/connection/notifications.js가 부름
const { NOTIFICATION_TYPES, SYSTEM_WELCOME, friendRequestSourceKey, gameInviteSourceKey, achievementSourceKey } = require('./constants');
const { toPublicNotification, emitNotificationCreated } = require('./notify');
const { createNotification, createForFriendRequest, createForGameInvite, createForAchievement, ensureSystemWelcome } = require('./create');
const { listForUser, markRead, deleteReadForUser } = require('./manage');
const { __internal } = require('./deps');

module.exports = {
    NOTIFICATION_TYPES,
    SYSTEM_WELCOME,
    friendRequestSourceKey,
    gameInviteSourceKey,
    achievementSourceKey,
    toPublicNotification,
    createNotification,
    createForFriendRequest,
    createForGameInvite,
    createForAchievement,
    emitNotificationCreated,
    ensureSystemWelcome,
    listForUser,
    markRead,
    deleteReadForUser,
    __internal,
};
