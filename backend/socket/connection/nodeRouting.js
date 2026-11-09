// Node 길잡이 파일, 접속 때 이 사람 방·판이 다른 Node에 있으면 WRONG_NODE로 거절해 그 Node로 다시 붙게 함
// socket.js가 인증 다음 io.use(nodeRouting)로 붙임, 화면(조각 5)은 connect_error data.node로 다시 붙음 (3장 이동 흐름)
const cluster = require("../../cluster");

const WRONG_NODE = "WRONG_NODE";
// 화면이 따라가는 Node 이름 모양 (frontend nodeHint.js와 같음), 안 맞으면 보내 봐야 못 따라가서 그냥 받음
const ROUTABLE_NODE_ID = /^[A-Za-z0-9_-]{1,32}$/;
const isRoutable = (node) => typeof node === "string" && ROUTABLE_NODE_ID.test(node);

// 거절 오류: socket.io가 connect_error로 message·data를 그대로 넘김
function wrongNodeError(node) {
    const error = new Error(WRONG_NODE);
    error.data = { node };
    return error;
}

// 화면이 붙일 때 달고 온 힌트 (?node=)
const hintOf = (socket) => {
    const node = socket?.handshake?.query?.node;
    return typeof node === "string" ? node : null;
};

// draining일 때 보낼 Node: 살아 있고 draining 아닌 다른 Node 중 접속자·판·방이 가장 적은 곳, 없으면 null
function pickLeastBusyNode() {
    const load = (n) => n.online * 4 + n.games * 2 + n.rooms;
    const candidates = cluster.nodes.list().filter((n) => !n.self && n.alive && !n.draining && isRoutable(n.id));
    candidates.sort((a, b) => load(a) - load(b) || a.id.localeCompare(b.id));
    return candidates[0]?.id ?? null;
}

// 갈 곳 정하기 → 보낼 Node 이름 또는 null(여기서 받음)
// - Redis 못 씀(단일 모드·down): 길잡이 안 함 (MN-098)
// - loc가 살아 있는 다른 Node(부팅까지 같음): 그 Node로 (MN-007)
// - loc가 죽은 Node·옛 부팅(같은 이름 재시작): 값 그대로일 때만 지우고 받음 (MN-075·108·109)
// - 내가 draining이고 갈 곳(loc) 없음: 덜 바쁜 Node로, 단 나를 찍어 온 접속은 받음 (방 입장하러 온 것, MN-114)
async function chooseNode(socket) {
    if (!cluster.isShared()) return null;
    const uuid = socket?.data?.user?.uuid;
    if (typeof uuid !== "string" || !uuid) return null;
    const key = cluster.directory.keys().loc(uuid);
    const loc = await cluster.directory.locate(key);
    if (!loc.available) return null;
    if (loc.node && loc.alive) return loc.self || !isRoutable(loc.node) ? null : loc.node;
    if (loc.node) await cluster.directory.removeIfValue(key, loc.value);
    if (cluster.nodes.isDraining() && hintOf(socket) !== cluster.serverId()) return pickLeastBusyNode();
    return null;
}

// io.use 미들웨어: 다른 Node로 보낼 때만 거절, 확인 중 오류는 받음 (길잡이 때문에 접속이 막히면 안 됨)
// 거절된 접속은 connection 처리기까지 안 감 → 옛 탭 안 끊김·OFFLINE 안 씀 (MN-009)
function nodeRouting(socket, next) {
    chooseNode(socket).then(
        (node) => (node ? next(wrongNodeError(node)) : next()),
        () => next(),
    );
}

module.exports = { nodeRouting, chooseNode, pickLeastBusyNode, wrongNodeError, WRONG_NODE, ROUTABLE_NODE_ID };
