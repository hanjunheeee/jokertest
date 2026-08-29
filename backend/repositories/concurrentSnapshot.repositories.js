const db = require("../models");

// concurrent_snapshots는 append-only 기록 테이블입니다 — 갱신·삭제 경로를 두지 않습니다.
// timestamps:false인 모델이라 captured_at은 Sequelize가 채워주지 않고 호출자가 반드시
// 넘겨야 합니다(스케줄러가 찍은 시각이 곧 그 표본의 시각이어야 하기 때문입니다).
exports.createSnapshot = async ({ captured_at, total, lobby, in_game, room_count }) => {
    return await db.ConcurrentSnapshot.create({ captured_at, total, lobby, in_game, room_count });
};
