'use strict';

// Node 운영 파일, 내부 API의 Node 목록(/internal/cluster)과 Node 하나 drain 켜기·끄기
// controllers/ops/internal.js가 부름, 다른 Node drain은 RPC ops.setDraining으로 그 Node에 시킴
const cluster = require('../../cluster');
const { createError } = require('../../utils/appError');

const NODE_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

// Node 목록: 하트비트 표 그대로 (나는 늘 첫째), 바로 다시 읽고 보여 줌
const describeCluster = async () => {
    await cluster.nodes.refresh().catch(() => {});
    return {
        serverId: cluster.serverId(),
        redis: cluster.state(),
        partial: cluster.isEnabled() && !cluster.isShared(),
        nodes: cluster.nodes.list().map((node) => ({
            id: node.id,
            bootEpoch: node.bootEpoch,
            startedAt: node.startedAt,
            games: node.games,
            rooms: node.rooms,
            online: node.online,
            loopP95: node.loopP95,
            draining: node.draining,
            version: node.version,
            lastSeen: node.lastSeen,
            self: node.self,
        })),
    };
};

// RPC 오류 → 내부 API 오류 (없는 Node 404, Redis 못 씀 503, 그 밖 502)
const toHttpError = (error) => {
    if (error?.code === cluster.CODES.NODE_UNAVAILABLE) return createError('그 Node를 찾을 수 없습니다.', 404, 'NODE_UNAVAILABLE');
    if (error?.code === cluster.CODES.CLUSTER_UNAVAILABLE) return createError('Node끼리 연결이 안 됩니다.', 503, 'CLUSTER_UNAVAILABLE');
    return createError('그 Node가 답하지 않습니다.', 502, error?.code ?? 'RPC_FAILED');
};

// drain 켜기·끄기: 나면 바로, 다른 Node면 그 Node에 시킴 → { node, draining }
const setNodeDraining = async (nodeId, draining) => {
    if (typeof nodeId !== 'string' || !NODE_ID_PATTERN.test(nodeId)) {
        throw createError('Node 이름이 올바르지 않습니다.', 400, 'INVALID_NODE');
    }
    try {
        const reply = await cluster.rpc.call(nodeId, 'ops.setDraining', { draining });
        return { node: nodeId, draining: reply?.draining === true };
    } catch (error) {
        throw toHttpError(error);
    }
};

// 다른 Node가 시키는 것: 이 Node drain 바꿈 (하트비트에 바로 실림)
cluster.rpc.register('ops.setDraining', (args) => ({ draining: cluster.nodes.setDraining(args?.draining !== false) }));

module.exports = { describeCluster, setNodeDraining };
