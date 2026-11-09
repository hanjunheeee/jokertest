'use strict';

// 운영 현황 서비스 시험 (AD-111·112·113), DB 숫자는 가짜로 바꿔 끼우고 진행 판·접속 수 합침만 봄
// 메모리 받침 Node 2개 (진짜 cluster 버스·RPC 코드, Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startPair } = require('../cluster/helpers/slice2');
const liveService = require('../../services/ops/live');
const maintenance = require('../../services/ops/maintenance');
const queryQueue = require('../../admin/services/core/queryQueue');
const summary = require('../../admin/services/dashboard/summary');

const STORED = Object.freeze({ totalMembers: 120, finishedToday: 7, openReports: 2, openInquiries: 3 });

// DB 숫자 가짜 (받은 오늘 시작 시각 남김)
const stubStored = (t, stored = STORED) => {
    const seen = { since: null };
    t.mock.method(summary, 'readStoredCounts', async (since) => { seen.since = since; return { ...stored }; });
    return seen;
};

// 판 한 줄 흉내 (phase만 봄)
const game = (gameId, phase = 'NIGHT') => ({ gameId, phase });

test.afterEach(() => maintenance.__setStateForTests({}));

test('AD-111: Node 둘 → 진행 판·접속 수 합, 오늘 총 판 수 = 끝난 + 진행 중, 결과 화면 판은 진행 중에서 뺌', async (t) => {
    stubStored(t);
    const { n2 } = await startPair(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 4, rooms: [], games: [game('g1'), game('g9', 'ENDED')] }));
    n2.rpc.register('ops.liveSummary', () => ({ onlineCount: 6, rooms: [], games: [game('g2', 'DAY'), game('g3', 'VOTE')] }));

    const result = await summary.getDashboardSummary();
    assert.equal(result.totalMembers, 120);
    assert.deepEqual(result.todayGames, { finished: 7, inProgress: 3, total: 10 });
    assert.equal(result.inProgressGames, 3);
    assert.equal(result.onlineCount, 10);
    assert.equal(result.openReports, 2);
    assert.equal(result.openInquiries, 3);
    assert.equal(result.live.partial, false);
    assert.deepEqual(result.live.nodes.map((line) => [line.node, line.ok]), [['n1', true], ['n2', true]]);
    assert.equal(result.liveError, undefined);
});

test('AD-111: 단일 모드 → 이 Node 요약만, 점검 상태 같이', async (t) => {
    stubStored(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 2, rooms: [], games: [game('g1')] }));
    maintenance.__setStateForTests({ enabled: true, message: '점검', startsAt: new Date('2026-11-10T01:00:00.000Z') });

    const result = await summary.getDashboardSummary({ now: new Date('2026-11-10T00:00:00.000Z') });
    assert.deepEqual(result.todayGames, { finished: 7, inProgress: 1, total: 8 });
    assert.equal(result.onlineCount, 2);
    assert.equal(result.maintenance.enabled, true);
    assert.equal(result.maintenance.startsAt, '2026-11-10T01:00:00.000Z');
    assert.equal(typeof result.maintenance.active, 'boolean');
    assert.equal(result.live, undefined);
});

test('AD-111: DB 숫자는 관리자 조회 줄 안에서 읽음', async (t) => {
    stubStored(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 0, rooms: [], games: [] }));
    const runs = t.mock.method(queryQueue, 'run', (fn) => fn());
    await summary.getDashboardSummary();
    assert.equal(runs.mock.callCount(), 1);
});

test('AD-112: live 못 받음(던짐) → 진행 판·접속 수 null + LIVE_UNAVAILABLE, 나머지 그대로 200 모양', async (t) => {
    t.mock.method(console, 'warn', () => {});
    stubStored(t);
    t.mock.method(liveService, 'getLiveSummary', () => { throw new Error('장부 읽기 실패'); });

    const result = await summary.getDashboardSummary();
    assert.equal(result.liveError, 'LIVE_UNAVAILABLE');
    assert.equal(result.inProgressGames, null);
    assert.equal(result.onlineCount, null);
    assert.deepEqual(result.todayGames, { finished: 7, inProgress: null, total: null });
    assert.equal(result.totalMembers, 120);
    assert.equal(result.openReports, 2);
    assert.equal(result.openInquiries, 3);
    assert.equal(typeof result.maintenance.enabled, 'boolean');
});

test('AD-112: Node 하나만 답 못 함 → 숫자는 답한 Node 합 + live.partial true (못 받음 아님)', async (t) => {
    stubStored(t);
    const { n2 } = await startPair(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 4, rooms: [], games: [game('g1')] }));
    n2.rpc.register('ops.liveSummary', () => { throw Object.assign(new Error('x'), { code: 'BROKEN' }); });

    const result = await summary.getDashboardSummary();
    assert.equal(result.liveError, undefined);
    assert.equal(result.inProgressGames, 1);
    assert.equal(result.onlineCount, 4);
    assert.equal(result.live.partial, true);
    assert.deepEqual(result.live.nodes.map((line) => [line.node, line.ok]), [['n1', true], ['n2', false]]);
});

test('AD-112: Node 전부 답 못 함 → LIVE_UNAVAILABLE', async (t) => {
    t.mock.method(console, 'warn', () => {});
    stubStored(t);
    t.mock.method(liveService, 'getClusterLiveSummary', async () => ({
        onlineCount: 0, games: [], nodes: [{ node: 'n1', ok: false, code: 'RPC_TIMEOUT' }], partial: true,
    }));
    const cluster = require('../../cluster');
    t.mock.method(cluster, 'isEnabled', () => true);

    const result = await summary.getDashboardSummary();
    assert.equal(result.liveError, 'LIVE_UNAVAILABLE');
    assert.equal(result.onlineCount, null);
    assert.deepEqual(result.live.nodes, [{ node: 'n1', ok: false, code: 'RPC_TIMEOUT' }]);
});

test('AD-112: DB 숫자 실패는 그대로 던짐 (관리자 오류 처리기 몫)', async (t) => {
    t.mock.method(summary, 'readStoredCounts', async () => { throw Object.assign(new Error('조회 멈춤'), { code: 'ADMIN_QUERY_TIMEOUT' }); });
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 0, rooms: [], games: [] }));
    await assert.rejects(summary.getDashboardSummary(), { code: 'ADMIN_QUERY_TIMEOUT' });
});

test('AD-113: 오늘 = 한국 0시부터 (UTC 15:00 경계)', () => {
    // 한국 11/10 23:59:59 → 오늘 시작 11/10 0시(= UTC 11/9 15:00)
    assert.equal(summary.kstDayStart(new Date('2026-11-10T14:59:59.999Z')).toISOString(), '2026-11-09T15:00:00.000Z');
    // 한국 11/11 0시 정각 → 새 날
    assert.equal(summary.kstDayStart(new Date('2026-11-10T15:00:00.000Z')).toISOString(), '2026-11-10T15:00:00.000Z');
    // 한국 11/10 아침 9시(= UTC 0시)
    assert.equal(summary.kstDayStart(new Date('2026-11-10T00:00:00.000Z')).toISOString(), '2026-11-09T15:00:00.000Z');
});

test('AD-113: DB 숫자에 넘기는 오늘 시작 = 한국 0시', async (t) => {
    const seen = stubStored(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 0, rooms: [], games: [] }));
    await summary.getDashboardSummary({ now: new Date('2026-11-10T15:30:00.000Z') });
    assert.equal(seen.since.toISOString(), '2026-11-10T15:00:00.000Z');
});
