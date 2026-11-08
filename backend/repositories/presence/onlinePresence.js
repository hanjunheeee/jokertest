// 접속 상태 저장소 파일, 접속 행 읽기·저장
// 친구 목록(friend/list.js)·접속 상태(presence/status.js) 서비스가 모듈 객체로 바로 부름

const db     = require("../../models");
const { Op } = db.Sequelize;

// 여러 계정 접속 행 (친구 목록에 상태 붙이기)
exports.findOnlinePresences = async (userIds) => {
    return await db.OnlinePresence.findAll({ where: { user_id: { [Op.in]: userIds } } });
};

// 계정 하나 접속 행 (지금 부르는 곳 없음)
exports.findOnlinePresence = async (userId) => {
    return await db.OnlinePresence.findOne({ where: { user_id: userId } });
};

// 접속 상태 저장 (없으면 만들고, 있으면 바꿈), 마지막 활동 시각은 지금으로 + 받은 서버 이름
exports.upsertOnlinePresence = async (userId, status, serverId) => {
    return await db.OnlinePresence.upsert({
        user_id:        userId,
        status,
        last_active_at: new Date(),
        server_id:      serverId,
    });
};

// 기준 시각 전 활동한 이 서버 접속 줄을 OFFLINE으로 (서버 켤 때, 끊김 처리 못 돌고 죽은 서버가 남긴 ONLINE 지우기)
// 이 서버 이름 줄 + 이름 없는 옛 줄(0029 전 저장)만, 다른 서버 접속자는 안 건드림
// 기준 시각 뒤에 붙은 사람 줄은 안 건드림 (켜자마자 다시 붙은 사람이 오프라인으로 덮이지 않게), 바뀐 줄 수 돌려줌
exports.markOfflineBefore = async (cutoff, serverId) => {
    const [changed] = await db.OnlinePresence.update(
        { status: "OFFLINE" },
        {
            where: {
                status: { [Op.ne]: "OFFLINE" },
                last_active_at: { [Op.lt]: cutoff },
                [Op.or]: [{ server_id: serverId }, { server_id: null }],
            },
        },
    );
    return changed;
};
