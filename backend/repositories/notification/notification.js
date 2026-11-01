'use strict';

// 알림 저장소 파일, 출처 키로 한 번만 만들기·찾기 · 중복 오류 판정 · 목록 · 읽음 · 읽은 것 지우기
// 알림 서비스가 주입 db를 넘겨 부름 (시험은 가짜 db)
const { Op } = require('sequelize');

// 같은 사용자·출처 키 알림을 없으면 만듦 → [행, 새로 만들었나]
const findOrCreateBySource = (db, { userId, sourceKey, defaults }, transaction) => db.Notification.findOrCreate({
    where: { user_id: userId, source_key: sourceKey },
    defaults,
    transaction,
});

// 같은 사용자·출처 키 알림 하나
const findBySource = (db, { userId, sourceKey }, transaction) => db.Notification.findOne({
    where: { user_id: userId, source_key: sourceKey },
    transaction,
});

// 같은 사용자·출처 키 유일 제약에 걸린 건지 (다른 유일 오류는 아님)
const isDuplicateSourceError = (error, db, userId, sourceKey) => {
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

// 그 사람 알림 최근 것부터
const listByUser = (db, userId) => db.Notification.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
});

// 그 사람의 그 알림 하나
const findForUser = (db, { notificationId, userId }, transaction) => db.Notification.findOne({
    where: { id: notificationId, user_id: userId },
    transaction,
});

// 아직 안 읽었을 때만 읽음 시각 넣기
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
