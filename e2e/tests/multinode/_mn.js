'use strict';

// Node 여러 개 시험 도우미 파일, 사람·봇을 정한 Node에 붙이기·Node 상태 보기·Node 하나 끄기·드레인
// tests/multinode/** 가 씀, E2E_NODES=2 이상에서만 뜻 있음 (1이면 playwright.config가 이 폴더를 안 돌림)
const { test: base, expect, E2E, openPerson, internal, e2e } = require('../../helpers/fixtures');
const accountsLib = require('../../helpers/accounts');
const servers = require('../../helpers/servers');
const { sleep } = require('../../helpers/wait');

const NODE_IDS = E2E.nodes.map((n) => n.id);
/** 다른 Node 하나 (2개면 반대쪽) */
const otherNode = (id) => NODE_IDS.find((n) => n !== id);

// 화면 Node 힌트(sessionStorage mmc.node, frontend shared/socket/nodeHint.js 모양)를 미리 넣어 첫 접속부터 그 Node로
async function pinContext(context, uuid, node) {
    await context.addInitScript(([key, value]) => {
        try { sessionStorage.setItem(key, value); } catch { /* 저장소 막힘 */ }
    }, ['mmc.node', JSON.stringify({ uuid, node })]);
}

const test = base.extend({
    /**
     * 정한 Node 로비에 사람 하나: await onNode.person('e2e-n2', { mobile? }) → { account, context, page, node }
     * 화면이 그 Node에 붙는지는 서버 길잡이에 맡김 (힌트만 줌), 끝나면 context 닫음
     */
    onNode: async ({ browser }, use, testInfo) => {
        const opened = [];
        await use({
            person: async (node, { mobile = testInfo.project.name.startsWith('mobile'), lobby = true } = {}) => {
                const account = await accountsLib.createAccount();
                const p = await openPerson(browser, {
                    mobile, account, lobby,
                    onContext: (context) => { opened.push(context); pinContext(context, account.uuid, node).catch(() => {}); },
                });
                return { ...p, node };
            },
        });
        await Promise.all(opened.map((c) => c.close().catch(() => {})));
    },
});

/** 봇을 그 Node로 옮김 (moveToNode = 끊고 ?node= 붙여 다시 붙기) */
async function moveBot(bot, node) {
    const ok = await bot.moveToNode(node);
    expect(ok, `봇${bot.index} ${node}로 못 옮김`).toBe(true);
    return bot;
}

/** 봇 n개를 그 Node에 */
async function botsOn(bots, n, node) {
    const list = await bots.spawn(n);
    for (const b of list) await moveBot(b, node);
    return list;
}

/** Node 하나 /health (앞단 안 거치고 바로) → body 또는 null */
async function nodeHealth(id) {
    const node = E2E.nodes.find((n) => n.id === id);
    try {
        const res = await fetch(`${node.url}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/** 앞단으로 /health?node= → 답한 Node의 serverId (nginx·node 앞단의 ?node= 고르기 확인) */
async function routedServerId(node) {
    const res = await fetch(`${E2E.apiUrl}/health${node ? `?node=${encodeURIComponent(node)}` : ''}`, { signal: AbortSignal.timeout(3000) });
    return (await res.json())?.serverId ?? null;
}

/** 그 사람 판이 도는 Node (/e2e/users/:uuid/game의 node, 조각 2) */
async function gameNodeOf(uuid) {
    return (await e2e.gameOf(uuid))?.node ?? null;
}

/** 관리자 통로 Node 목록 (/internal/cluster, 조각 2) → [{ id, games, rooms, draining, alive, ... }] */
async function clusterNodes() {
    const r = await internal.raw('GET', '/internal/cluster');
    if (!r.ok) throw new Error(`/internal/cluster → ${r.status}`);
    return Array.isArray(r.body) ? r.body : (r.body?.nodes ?? []);
}

/** 드레인 켜기 (그 Node가 새 로비 접속·방 만들기를 다른 Node로) */
async function drain(id) {
    const r = await internal.raw('POST', `/internal/nodes/${encodeURIComponent(id)}/drain`, {});
    if (!r.ok) throw new Error(`drain ${id} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
}

/** Node 하나 끄기(SIGTERM, 안내 있음)·죽이기(kill, 안내 없음) → start-backend가 곧 다시 켬 */
const stopNode = (id, { kill = false } = {}) => servers.triggerShutdown({ node: id, kill });

/** 그 Node가 다시 /health 200 될 때까지 */
async function waitNodeUp(id, timeoutMs = 60000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (await nodeHealth(id)) return;
        await sleep(300);
    }
    throw new Error(`${id}가 다시 안 켜짐`);
}

module.exports = {
    test, expect, E2E, NODE_IDS, otherNode, pinContext, moveBot, botsOn, nodeHealth, routedServerId,
    gameNodeOf, clusterNodes, drain, stopNode, waitNodeUp, internal, e2e,
};
