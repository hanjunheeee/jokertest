'use strict';

// 알림 관리 파일, 목록 · 하나 읽음 · 읽은 것 지우기
// 알림 컨트롤러가 부름
const { createError } = require('../../utils/appError');
const notificationRepository = require('../../repositories/notification');
const { withTransaction } = require('../../repositories/common');
const { getDeps } = require('./deps');
const { toPublicNotification } = require('./view');
const { UUID_PATTERN } = require('./constants');

// 내 알림 최근 것부터
const listForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];
    const { db } = getDeps();
    const rows = await notificationRepository.listByUser(db, userId);
    return rows.map(toPublicNotification);
};

// 내 알림인지 잠가서 확인 뒤 읽음 표시 (이미 읽었으면 그대로)
const markRead = async (userId, notificationId) => {
    if (typeof notificationId !== 'string' || !UUID_PATTERN.test(notificationId)) {
        throw createError('유효하지 않은 알림 id입니다.', 400);
    }

    const { db, now } = getDeps();
    return withTransaction(db, async (transaction) => {
        const row = await notificationRepository.findForUser(db, { notificationId, userId }, transaction);
        if (!row) throw createError('알림을 찾을 수 없습니다.', 404);

        if (row.read_at === null || row.read_at === undefined) {
            await notificationRepository.markReadIfUnread(db, { notificationId, userId, readAt: now() }, transaction);
        }

        const confirmed = await notificationRepository.findForUser(db, { notificationId, userId }, transaction);
        return toPublicNotification(confirmed);
    });
};

// 읽은 알림만 지우고 지운 수 돌려줌
const deleteReadForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('알림 대상 계정이 없습니다.', 500);
    }

    const { db } = getDeps();
    const deletedCount = await notificationRepository.deleteReadByUser(db, userId);

    return { deletedCount };
};

module.exports = {
    listForUser,
    markRead,
    deleteReadForUser,
};
