'use strict';

// 브라우저 시험 손잡이 Node 넘기 파일, /e2e 요청이 아무 Node로 와도 방·판이 있는 Node 것을 읽고 바꿈 (RPC e2e.*)
// routes/e2e.routes.js가 부름, E2E_HOOKS 켜진 Node만 처리기 등록 (단일 모드는 이 Node 장부만 봄 = 예전 그대로)
const cluster = require('../../cluster');
const { isE2eHooksEnabled } = require('../../config/e2eHooks');
const gameHooks = require('./gameHooks');

const sameNode = (value) => ({ value, node: cluster.serverId() });
// 찾은 값인지: 없음(null) · SESSION_NOT_FOUND(ok:false)는 못 찾음
const found = (value) => value !== null && value !== undefined && value.ok !== false;

// 주인 Node 먼저 (디렉터리 값이 있으면), 그다음 전 Node에 물어 처음 찾은 것 → { value, node } (못 찾으면 value null)
async function askOtherNodes(method, args, ownerKey) {
    if (!cluster.isShared()) return { value: null, node: null };
    if (ownerKey) {
        const owner = await cluster.directory.locate(ownerKey);
        if (owner.node && !owner.self && owner.alive) {
            try {
                const value = await cluster.rpc.call(owner.node, method, args);
                if (found(value)) return { value, node: owner.node };
            } catch { /* 아래 전 Node로 */ }
        }
    }
    // 디렉터리 값은 조각 3·4가 채움, 아직 없으면 전 Node에 물음 (시험 경로라 드물게 불림)
    const { results } = await cluster.rpc.callAll(method, args);
    const hit = results.find((r) => r.ok && r.node !== cluster.serverId() && found(r.value));
    return hit ? { value: hit.value, node: hit.node } : { value: null, node: null };
}

// 이 Node 먼저, 없으면 다른 Node
async function lookup(localValue, method, args, ownerKey) {
    if (found(localValue)) return sameNode(localValue);
    return askOtherNodes(method, args, ownerKey);
}

const keys = () => cluster.directory.keys();

// 역할 예약: 이 Node에 넣고(모양 틀리면 여기서 던짐) 다른 Node에도 넣음
// 방 예약은 방 id가 유일해서 다른 Node 것은 안 쓰이고 15분 뒤 버려짐, 사람 예약은 쓴 Node가 다른 Node 것을 지움
async function setRolePresets(presets, { roomId } = {}) {
    const size = gameHooks.setRolePresets(presets, { roomId });
    let partial = false;
    if (cluster.isShared()) {
        const { results } = await cluster.rpc.callAll('e2e.setRolePresets', { presets, roomId: roomId ?? null });
        partial = results.some((r) => !r.ok && r.node !== cluster.serverId());
    } else if (cluster.isEnabled()) partial = true;
    return { size, partial };
}

// 예약 지우기: 이 Node + 다른 Node 전부 (target 없으면 전부)
async function clearRolePresets(target) {
    gameHooks.clearRolePresets(target);
    if (cluster.isShared()) await cluster.rpc.callAll('e2e.clear', target === undefined ? { all: true } : target);
}

const describeUserGame = (uuid) => lookup(
    gameHooks.describeSession(gameHooks.findSessionByUser(uuid)), 'e2e.describeUserGame', { uuid }, keys().loc(uuid),
);
const describeUserRoom = (uuid) => lookup(gameHooks.describeRoomByUser(uuid), 'e2e.describeUserRoom', { uuid }, keys().loc(uuid));
const describeGame = (gameId) => lookup(
    gameHooks.describeSession(gameHooks.getSessionById(gameId)), 'e2e.describeGame', { gameId }, keys().game(gameId),
);

// 단계 바로 끝내기: 판 있는 Node 타이머만 돌릴 수 있음
async function advance(gameId) {
    const local = gameHooks.advanceSession(gameId);
    if (local.ok) return sameNode(local);
    const remote = await askOtherNodes('e2e.advance', { gameId }, keys().game(gameId));
    return remote.value ? remote : { value: local, node: null };
}

const asId = (value) => (typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null);

// 다른 Node가 시키는 것 (E2E_HOOKS 켜진 Node만), 처리기는 이 Node 장부만 봄 (다시 다른 Node로 안 넘김)
function registerHandlers() {
    cluster.rpc.register('e2e.setRolePresets', (args) => gameHooks.setRolePresets(args?.presets, { roomId: asId(args?.roomId) ?? undefined }));
    cluster.rpc.register('e2e.clear', (args) => {
        if (args?.all === true) gameHooks.clearRolePresets();
        else if (Array.isArray(args?.uuids) || asId(args?.roomId)) {
            gameHooks.clearRolePresets({ uuids: Array.isArray(args.uuids) ? args.uuids : undefined, roomId: asId(args.roomId) ?? undefined });
        }
        return { ok: true };
    });
    cluster.rpc.register('e2e.describeUserGame', (args) => gameHooks.describeSession(gameHooks.findSessionByUser(asId(args?.uuid))));
    cluster.rpc.register('e2e.describeUserRoom', (args) => gameHooks.describeRoomByUser(asId(args?.uuid)));
    cluster.rpc.register('e2e.describeGame', (args) => gameHooks.describeSession(gameHooks.getSessionById(asId(args?.gameId))));
    cluster.rpc.register('e2e.advance', (args) => gameHooks.advanceSession(asId(args?.gameId)));
}

if (isE2eHooksEnabled()) registerHandlers();

module.exports = {
    setRolePresets, clearRolePresets, describeUserGame, describeUserRoom, describeGame, advance, registerHandlers,
};
