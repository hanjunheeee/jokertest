'use strict';

// 알림 입구, 옛 notification.service와 같은 이름만 골라 내보냄
// 컨트롤러·친구·초대·업적·socket.js 알림 준비가 이 입구로 부름
const { NOTIFICATION_TYPES, SYSTEM_WELCOME, friendRequestSourceKey, gameInviteSourceKey, achievementSourceKey } = require('./constants');
const { toPublicNotification } = require('./view');
const { createNotification, createForFriendRequest, createForGameInvite, createForAchievement, ensureSystemWelcome } = require('./create');
const { emitNotificationCreated } = require('./notify');
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
