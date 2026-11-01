'use strict';

// 알림 저장소 파일, 출처 키로 한 번만 만들기·찾기 · 중복 오류 판정 · 목록 · 읽음 · 읽은 것 지우기
// 알림 서비스(notification/create·manage)가 주입 db를 넘겨 부름 (시험은 가짜 db)
const { Op } = require('sequelize');

// 같은 사람·출처 키 알림을 없으면 만듦 → [행, 새로 만들었나] (같은 일로 알림 두 번 막기)
const findOrCreateBySource = (db, { userId, sourceKey, defaults }, transaction) => db.Notification.findOrCreate({
    where: { user_id: userId, source_key: sourceKey },
    defaults,
    transaction,
});

// 같은 사람·출처 키 알림 하나 (동시 만들기에 졌을 때 있던 것 꺼내기)
const findBySource = (db, { userId, sourceKey }, transaction) => db.Notification.findOne({
    where: { user_id: userId, source_key: sourceKey },
    transaction,
});

// 같은 사람·출처 키 유일 제약에 걸린 건지 (다른 유일 오류는 아님)
const isDuplicateSourceError = (error, db, userId, sourceKey) => {
    // 가짜 db엔 오류 클래스가 없을 수 있어 이름으로도 봄
    const UniqueConstraintError = db?.Sequelize?.UniqueConstraintError;
    const isUniqueError = UniqueConstraintError
        ? error instanceof UniqueConstraintError
        : error?.name === 'SequelizeUniqueConstraintError';
    if (!isUniqueError) return false;
    // 제약 이름·fields 안 이름·두 칸 값 중 하나면 같은 알림 (방언마다 다름)
    const constraint = error?.parent?.constraint ?? error?.original?.constraint;
    if (constraint === 'notifications_user_source_unique') return true;
    if (Object.prototype.hasOwnProperty.call(error?.fields ?? {}, 'notifications_user_source_unique')) return true;
    return error?.fields?.user_id === userId && error?.fields?.source_key === sourceKey;
};

// 그 사람 알림 최근 것부터 (같은 시각이면 id 큰 것 먼저)
const listByUser = (db, userId) => db.Notification.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
});

// 그 사람의 그 알림 하나 (남의 알림은 못 건드리게 user_id도 같이 봄)
const findForUser = (db, { notificationId, userId }, transaction) => db.Notification.findOne({
    where: { id: notificationId, user_id: userId },
    transaction,
});

// 아직 안 읽었을 때만 읽음 시각 넣기 (처음 읽은 시각 지키기)
const markReadIfUnread = (db, { notificationId, userId, readAt }, transaction) => db.Notification.update(
    { read_at: readAt },
    { where: { id: notificationId, user_id: userId, read_at: null }, transaction },
);

// 그 사람 읽은 알림만 지움 → 지운 수
const deleteReadByUser = (db, userId) => db.Notification.destroy({
    where: {
        user_id: userId,
        read_at: { [Op.ne]: null },
    },
});

module.exports = {
    findOrCreateBySource,
    findBySource,
    isDuplicateSourceError,
    listByUser,
    findForUser,
    markReadIfUnread,
    deleteReadByUser,
};
