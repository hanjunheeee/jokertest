'use strict';

// 다시 읽기 맞추기 파일, 점검·금지어를 한 Node가 다시 읽으면 다른 Node도 DB 다시 읽게 함 (버스 ops.reload + 60초 안전망)
// maintenance.js·bannedWords.js가 registerReloadable로 등록, 내부 API 처리기가 다시 읽은 뒤 announceReload로 알림, 관리자 저장은 reloadEverywhere
const cluster = require('../../cluster');
const { readClusterConfig } = require('../../config/cluster');

// what 이름 → 다시 읽기 함수 (DB 읽기, 실패하면 던짐)
const reloaders = new Map();
let safetyTimer = null;

// 하나 다시 읽기 (실패는 로그 한 줄, 있던 값 그대로 = 각 reload 함수 규칙)
const reloadOne = async (what) => {
    const fn = reloaders.get(what);
    if (!fn) return false;
    try {
        await fn();
        return true;
    } catch (error) {
        console.warn(`[OPS] ${what} 다시 읽기 실패 —`, error?.name ?? 'Error');
        return false;
    }
};

// 등록된 것 전부 다시 읽기 (안전망·Redis 살아남)
const reloadAll = () => Promise.all([...reloaders.keys()].map(reloadOne));

// 안전망 한 차례: Node 여러 개 모드일 때만 (단일 모드는 받은 Node가 곧 전부라 할 일 없음)
const safetyTick = () => (cluster.isEnabled() ? reloadAll() : Promise.resolve([]));

// 안전망 타이머 켜기 (한 번만, 프로세스 종료는 안 막음)
const startSafetyNet = (intervalMs = readClusterConfig(process.env).opsReloadIntervalMs) => {
    if (safetyTimer) return safetyTimer;
    safetyTimer = setInterval(() => { void safetyTick(); }, intervalMs);
    safetyTimer.unref?.();
    return safetyTimer;
};

// 등록: 이 이름 방송을 받으면 이 함수로 다시 읽음
const registerReloadable = (what, fn) => {
    reloaders.set(what, fn);
    startSafetyNet();
};

// 이 Node가 다시 읽은 뒤 다른 Node에 알림 → 보냈으면 true (단일 모드·Redis down이면 false, 안전망이 메움)
const announceReload = (what) => cluster.bus.publish(cluster.BUS_TYPES.OPS_RELOAD, { what });

// 다른 Node가 다시 읽었음 → 나도 DB 다시 읽기 (모르는 what은 무시)
cluster.bus.on(cluster.BUS_TYPES.OPS_RELOAD, (msg) => {
    if (typeof msg.what === 'string' && reloaders.has(msg.what)) return reloadOne(msg.what);
    return undefined;
});

// Redis가 다시 살아남 → 죽은 동안 놓친 방송 대신 바로 다시 읽기
cluster.onResync(() => reloadAll());

// 다른 Node가 "지금 다시 읽어" 물음 → 다시 읽고 결과를 값으로 답함 (던지면 code가 RPC_FAILED로 뭉개져서)
const reloadNow = async (what) => {
    if (typeof what !== 'string' || !reloaders.has(what)) return { ok: false, code: 'UNKNOWN_RELOAD' };
    return (await reloadOne(what)) ? { ok: true } : { ok: false, code: 'RELOAD_FAILED' };
};
cluster.rpc.register('ops.reloadNow', (args) => reloadNow(args?.what));

// RPC 결과 한 줄 → 화면에 보일 Node 결과 { node, ok, code? }
// 예: { node:'n2', ok:true, value:{ ok:false, code:'RELOAD_FAILED' } } → { node:'n2', ok:false, code:'RELOAD_FAILED' }
const toNodeResult = (result) => {
    if (!result.ok) return { node: result.node, ok: false, code: result.code ?? 'RPC_FAILED' };
    if (result.value?.ok === true) return { node: result.node, ok: true };
    return { node: result.node, ok: false, code: result.value?.code ?? 'RELOAD_FAILED' };
};

// 관리자 저장 뒤 전 Node 바로 다시 읽기 → { nodes:[{ node, ok, code? }], partial } (던지지 않음)
// 못 받은 Node는 기존 60초 안전망이 메움, partial = 한 Node라도 반영 못 함
const reloadEverywhere = async (what) => {
    try {
        const { results, partial } = await cluster.rpc.callAll('ops.reloadNow', { what });
        const nodes = results.map(toNodeResult);
        return { nodes, partial: Boolean(partial) || nodes.some((n) => !n.ok) };
    } catch (error) {
        return { nodes: [{ node: cluster.serverId(), ok: false, code: error?.code ?? 'RELOAD_FAILED' }], partial: true };
    }
};

module.exports = {
    registerReloadable,
    reloadEverywhere,
    announceReload,
    reloadAll,
    __testables: {
        safetyTick,
        startSafetyNet,
        stopSafetyNet: () => { clearInterval(safetyTimer); safetyTimer = null; },
    },
};
