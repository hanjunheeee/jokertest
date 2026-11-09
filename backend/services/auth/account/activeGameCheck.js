// 판 중인지 확인 파일, 탈퇴 전에 그 사람이 어느 Node에서든 진행 중인 판에 있는지 봄 (다른 Node면 위치 디렉터리 + RPC)
// withdraw.js가 부름, RPC user.inActiveGame 처리기도 여기서 등록 (판 장부는 모듈 객체로 불러 시험 갈아끼우기 먹게)
const cluster = require("../../../cluster");
const gameSession = require("../../../game-core/gameSession");
const { createError } = require("../../../utils/appError");

// 이 Node에서 진행 중인 판에 있는지 (끝난 판·기권은 통과)
const isInActiveGameHere = (uuid) => gameSession.isMatchmakingBlocked(uuid)
    && Boolean(gameSession.getActiveSessionRoutingInfo(uuid));

// 확인 못 함 → 탈퇴는 503 (판 중인데 탈퇴되는 것보다 잠시 뒤 다시가 나음)
const unavailable = () => createError("지금 게임 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.", 503, "CLUSTER_UNAVAILABLE");

// 다른 Node에 물어봄: 그 Node가 사라졌으면 판도 사라짐(false), 답 없음·Redis 못 씀은 확인 못 함
async function askOwner(node, uuid) {
    try {
        const reply = await cluster.rpc.call(node, "user.inActiveGame", { uuid });
        return reply?.inGame === true;
    } catch (error) {
        if (error?.code === cluster.CODES.NODE_UNAVAILABLE) return false;
        throw unavailable();
    }
}

// 어느 Node에서든 판 중인지 → true/false, 확인 못 하면 503 CLUSTER_UNAVAILABLE 던짐
// 위치(loc:<uuid>)가 없으면 판 아님으로 봄 (위치는 조각 3이 채움, 없을 때는 "못 찾음")
async function isInActiveGameAnywhere(uuid) {
    if (isInActiveGameHere(uuid)) return true;
    if (!cluster.isEnabled()) return false;
    if (!cluster.isShared()) throw unavailable();
    const found = await cluster.directory.locate(cluster.directory.keys().loc(uuid));
    if (!found.available) throw unavailable();
    if (!found.node || found.self || !found.alive) return false;
    return askOwner(found.node, uuid);
}

// 다른 Node가 묻는 것: 이 Node 판 장부 기준
cluster.rpc.register("user.inActiveGame", (args) => ({
    inGame: typeof args?.uuid === "string" && isInActiveGameHere(args.uuid),
}));

module.exports = { isInActiveGameHere, isInActiveGameAnywhere };
