'use strict';

// 알림 공개 모양 파일
// DB 행을 화면에 보낼 모양으로 바꿈, 만들기·목록이 씀

// 행이 없으면 null, 모델 행이면 plain으로 풀어서
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

module.exports = {
    toPublicNotification,
};
