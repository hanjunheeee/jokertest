'use strict';

// 알림 저장소 파일, 출처 키로 한 번만 만들기·찾기 · 중복 오류 판정 · 목록 · 읽음 · 읽은 것 지우기(안내는 숨김)
// 알림 서비스(notification/create·manage)가 주입 db를 넘겨 부름 (시험은 가짜 db)
const { Op } = require('sequelize');

// 같은 사람·출처 키 알림을 없으면 만듦 → [행, 새로 만들었나] (같은 일로 알림 두 번 막기)
const findOrCreateBySource = (db, { userId, sourceKey, defaults }, transaction) => db.Notification.findOrCreate({
    where: { user_id: userId, source_key: sourceKey },
    defaults,
    transaction,
});

// 같은 사람·출처 키 알림 하나 (동시 만들기에 졌을 때 있던 것 꺼내기)
// latest 참이면 잠금 읽기로 최신 커밋 값 봄 (REPEATABLE READ 스냅샷엔 남이 막 만든 행이 안 보이기 때문)
const findBySource = (db, { userId, sourceKey, latest = false }, transaction) => db.Notification.findOne({
    where: { user_id: userId, source_key: sourceKey },
    transaction,
    ...(latest && transaction?.LOCK?.SHARE ? { lock: transaction.LOCK.SHARE } : {}),
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

// 그 사람 알림 최근 것부터 limit개 (같은 시각이면 id 큰 것 먼저), hiddenType 주면 숨김 줄 뺌
const listByUser = (db, userId, limit, hiddenType = null) => db.Notification.findAll({
    where: { user_id: userId, ...(hiddenType ? { type: { [Op.ne]: hiddenType } } : {}) },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
});

// 그 사람의 그 알림 하나 (남의 알림은 못 건드리게 user_id도 같이 봄)
// lock 참이면 행 잠금 읽기 (최신 커밋 값 + 같은 알림 동시 처리 줄 세우기)
const findForUser = (db, { notificationId, userId, lock = false }, transaction) => db.Notification.findOne({
    where: { id: notificationId, user_id: userId },
    transaction,
    ...(lock && transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
});

// 아직 안 읽었을 때만 읽음 시각 넣기 (처음 읽은 시각 지키기)
const markReadIfUnread = (db, { notificationId, userId, readAt }, transaction) => db.Notification.update(
    { read_at: readAt },
    { where: { id: notificationId, user_id: userId, read_at: null }, transaction },
);

// 그 사람 읽은 알림만 지움 → 지운 수, keepSourceKeys 출처 키 줄은 안 지움 (숨김으로 따로 처리)
const deleteReadByUser = (db, userId, keepSourceKeys = []) => db.Notification.destroy({
    where: {
        user_id: userId,
        read_at: { [Op.ne]: null },
        ...(keepSourceKeys.length > 0 ? { source_key: { [Op.notIn]: keepSourceKeys } } : {}),
    },
});

// 읽은 안내 알림을 지우는 대신 숨김 줄로 바꿈 → 바꾼 수 (출처 키가 남아 접속 때 다시 안 만듦)
// 이미 숨긴 줄은 안 셈
const hideReadBySources = async (db, { userId, sourceKeys, hiddenType }) => {
    if (sourceKeys.length === 0) return 0;
    const [count] = await db.Notification.update({ type: hiddenType }, {
        where: {
            user_id: userId,
            read_at: { [Op.ne]: null },
            source_key: { [Op.in]: sourceKeys },
            type: { [Op.ne]: hiddenType },
        },
    });
    return count;
};

module.exports = {
    findOrCreateBySource,
    findBySource,
    isDuplicateSourceError,
    listByUser,
    findForUser,
    markReadIfUnread,
    deleteReadByUser,
    hideReadBySources,
};
