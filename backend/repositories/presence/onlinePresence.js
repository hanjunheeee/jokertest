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

// 조건부 OFFLINE (Node 여러 개): 이 서버 줄(또는 이름 없는 옛 줄)일 때만 OFFLINE
// 다른 Node로 옮겨 이미 ONLINE을 적은 줄은 안 덮음 (MN-068), 줄 없으면 안 만듦, 바뀐 줄 수 돌려줌
exports.markOfflineIfOwner = async (userId, serverId) => {
    const [changed] = await db.OnlinePresence.update(
        { status: "OFFLINE", last_active_at: new Date() },
        { where: { user_id: userId, [Op.or]: [{ server_id: serverId }, { server_id: null }] } },
    );
    return changed;
};

// 죽은 Node 줄 정리 (청소 담당): 살아 있는 Node 목록에 없는 서버 이름 ONLINE 줄 중 기준 시각 전 활동한 것만 OFFLINE
// 이름 없는 옛 줄은 NOT IN에 안 걸림 (서버 켤 때 markOfflineBefore가 맡음), 바뀐 줄 수 돌려줌
exports.markOfflineOnDeadServers = async (aliveServerIds, cutoff) => {
    if (!Array.isArray(aliveServerIds) || aliveServerIds.length === 0) return 0;
    const [changed] = await db.OnlinePresence.update(
        { status: "OFFLINE" },
        {
            where: {
                status: { [Op.ne]: "OFFLINE" },
                server_id: { [Op.notIn]: aliveServerIds },
                last_active_at: { [Op.lt]: cutoff },
            },
        },
    );
    return changed;
};

// 이름 없는 옛 줄(0029 전 저장)은 이만큼 더 오래된 것만 되돌림 (2026-11-09)
// 어느 서버 줄인지 몰라서, 막 붙은 다른 서버(옛 버전) 접속자를 켜는 서버가 OFFLINE으로 덮지 않게
const LEGACY_NULL_SERVER_STALE_MS = 60 * 60 * 1000;
exports.LEGACY_NULL_SERVER_STALE_MS = LEGACY_NULL_SERVER_STALE_MS;

// 기준 시각 전 활동한 이 서버 접속 줄을 OFFLINE으로 (서버 켤 때, 끊김 처리 못 돌고 죽은 서버가 남긴 ONLINE 지우기)
// 이 서버 이름 줄 + 1시간 넘게 활동 없는 이름 없는 옛 줄만, 다른 서버 접속자는 안 건드림
// 기준 시각 뒤에 붙은 사람 줄은 안 건드림 (켜자마자 다시 붙은 사람이 오프라인으로 덮이지 않게), 바뀐 줄 수 돌려줌
exports.markOfflineBefore = async (cutoff, serverId) => {
    const legacyCutoff = new Date(cutoff.getTime() - LEGACY_NULL_SERVER_STALE_MS);
    const [changed] = await db.OnlinePresence.update(
        { status: "OFFLINE" },
        {
            where: {
                status: { [Op.ne]: "OFFLINE" },
                [Op.or]: [
                    { server_id: serverId, last_active_at: { [Op.lt]: cutoff } },
                    { server_id: null, last_active_at: { [Op.lt]: legacyCutoff } },
                ],
            },
        },
    );
    return changed;
};
