'use strict';

// 통계 날짜 셈·기간 검사(AD-221·222) + 열린 방·판 합침(AD-250) 시험, DB 없이
// 열린 방은 메모리 받침 Node 2개 (진짜 cluster 버스·RPC 코드, Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const daily = require('../../admin/services/stats/daily');
const statsController = require('../../admin/controllers/stats.controller');
const liveController = require('../../admin/controllers/live.controller');
const liveSummary = require('../../admin/services/live/summary');
const liveService = require('../../services/ops/live');
const maintenance = require('../../services/ops/maintenance');
const { startPair } = require('../cluster/helpers/slice2');

// SQL → 어느 칸인지 (표·상태 이름으로)
const columnOf = (sql) => {
    if (sql.includes("'GRANTED'")) return 'revenueKrw';
    if (sql.includes("'REFUNDED'")) return 'refundsKrw';
    if (sql.includes('concurrent_snapshots')) return 'peakOnline';
    if (sql.includes('game_results')) return 'games';
    return 'signups';
};

// 줄 대신 바로 돌리는 가짜 + SQL마다 정한 줄을 주는 가짜 DB (받은 기간 남김)
const directQueue = { run: (fn) => fn() };
const fakeDb = (rowsByColumn = {}) => {
    const seen = [];
    const db = {
        sequelize: {
            query: async (sql, options) => {
                seen.push({ sql, replacements: options.replacements });
                const name = columnOf(sql);
                return rowsByColumn[name] ?? [];
            },
        },
    };
    return { db, seen };
};

test('AD-221: 한국 날짜 경계 — 한국 0시 = 전날 15시 UTC, 끝은 다음날 0시(안 포함)', () => {
    assert.equal(new Date(daily.kstDayStart('2026-11-10')).toISOString(), '2026-11-09T15:00:00.000Z');
    assert.equal(daily.kstDay(new Date('2026-11-09T14:59:59.999Z')), '2026-11-09');
    assert.equal(daily.kstDay(new Date('2026-11-09T15:00:00.000Z')), '2026-11-10');
    const range = daily.kstRange('2026-02-27', '2026-03-01');
    assert.equal(range.start.toISOString(), '2026-02-26T15:00:00.000Z');
    assert.equal(range.end.toISOString(), '2026-03-01T15:00:00.000Z');
    assert.deepEqual(range.dates, ['2026-02-27', '2026-02-28', '2026-03-01']);
    assert.deepEqual(daily.kstRange('2026-11-10', '2026-11-10').dates, ['2026-11-10']);
});

test('AD-221: SQL은 한국 날짜로 묶고(9시간 더함), 기간 인덱스 칸으로 거름, 시간 제한 5초', async () => {
    const { db, seen } = fakeDb({ signups: [{ day: '2026-11-10', value: '3' }] });
    const result = await daily.getDailyStats({ from: '2026-11-09', to: '2026-11-10' }, { db, queue: directQueue });
    assert.deepEqual(result.days, [
        { date: '2026-11-09', signups: 0, peakOnline: 0, games: 0, revenueKrw: 0, refundsKrw: 0 },
        { date: '2026-11-10', signups: 3, peakOnline: 0, games: 0, revenueKrw: 0, refundsKrw: 0 },
    ]);
    assert.equal(seen.length, 5);
    for (const { sql, replacements } of seen) {
        assert.match(sql, /^SELECT \/\*\+ MAX_EXECUTION_TIME\(5000\) \*\//);
        assert.match(sql, /INTERVAL 9 HOUR/);
        assert.equal(replacements.start, '2026-11-08 15:00:00');
        assert.equal(replacements.end, '2026-11-10 15:00:00');
    }
});

test('AD-222: 92일 넘음·거꾸로·이상한 날짜 → 400 INVALID_RANGE (DB 안 부름)', async () => {
    const { db, seen } = fakeDb();
    const cases = [
        [{ from: '2026-01-01', to: '2026-04-03' }, 'to'], // 93일 (1/1~4/2가 딱 92일)
        [{ from: '2026-11-10', to: '2026-11-09' }, 'to'],
        [{ from: '2026-02-30', to: '2026-03-01' }, 'from'],
        [{ from: '20261101', to: '2026-11-02' }, 'from'],
        [{ from: '2026-11-01', to: '' }, 'to'],
    ];
    for (const [range, field] of cases) {
        await assert.rejects(daily.getDailyStats(range, { db, queue: directQueue }), (error) => {
            assert.deepEqual([error.status, error.code, error.details.field], [400, 'INVALID_RANGE', field], JSON.stringify(range));
            return true;
        });
    }
    assert.equal(seen.length, 0);
    // 딱 92일은 됨
    assert.equal(daily.kstRange('2026-01-01', '2026-04-02').dates.length, 92);
});

test('AD-222: 통계 주소에 모르는 칸 → 400 INVALID_INPUT', async () => {
    await assert.rejects(statsController.getStats({ query: { from: '2026-11-01', to: '2026-11-02', x: '1' } }, {}), {
        status: 400, code: 'INVALID_INPUT',
    });
});

test.afterEach(() => maintenance.__setStateForTests({}));

test('AD-250: Node 둘 → 방·판 합침(node 칸·Node 줄·접속 수 합) + 점검 상태, /internal/live와 같은 모양', async (t) => {
    const { n2 } = await startPair(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 3, rooms: [{ roomId: 'r1', playerCount: 2 }], games: [] }));
    n2.rpc.register('ops.liveSummary', () => ({ onlineCount: 4, rooms: [{ roomId: 'r2', playerCount: 1 }], games: [{ gameId: 'g2' }] }));
    maintenance.__setStateForTests({ enabled: true, message: '점검', startsAt: new Date('2026-11-10T01:00:00.000Z') });

    const live = await liveSummary.getLive();
    assert.equal(live.onlineCount, 7);
    assert.deepEqual([live.roomCount, live.gameCount], [2, 1]);
    assert.deepEqual(live.rooms.map((room) => [room.roomId, room.node]), [['r1', 'n1'], ['r2', 'n2']]);
    assert.deepEqual(live.games, [{ gameId: 'g2', node: 'n2' }]);
    assert.deepEqual(live.nodes.map((line) => [line.node, line.ok]), [['n1', true], ['n2', true]]);
    assert.equal(live.partial, false);
    assert.equal(live.maintenance.enabled, true);

    // ?node=n2 → 그 Node 것만
    const only = await liveSummary.getLive({ node: 'n2' });
    assert.deepEqual([only.onlineCount, only.nodes.length, only.rooms[0].roomId], [4, 1, 'r2']);
});

test('AD-250: Node 하나 못 받음 → partial + 그 Node 줄 ok:false, 나머지는 그대로', async (t) => {
    const { n2 } = await startPair(t);
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 3, rooms: [{ roomId: 'r1' }], games: [] }));
    n2.rpc.register('ops.liveSummary', () => { throw Object.assign(new Error('x'), { code: 'BROKEN' }); });

    const live = await liveSummary.getLive();
    assert.equal(live.partial, true);
    assert.deepEqual(live.nodes.map((line) => [line.node, line.ok]), [['n1', true], ['n2', false]]);
    assert.deepEqual(live.rooms, [{ roomId: 'r1', node: 'n1' }]);
});

test('AD-250: 단일 모드 → 이 Node 요약, 주소 칸 검사', async (t) => {
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 1, roomCount: 0, gameCount: 0, rooms: [], games: [] }));
    const sent = {};
    await liveController.getLive({ query: {} }, { json: (body) => Object.assign(sent, body) });
    assert.deepEqual([sent.ok, sent.onlineCount, sent.partial], [true, 1, undefined]);
    assert.ok(sent.maintenance);
    await assert.rejects(liveController.getLive({ query: { node: 'n 2' } }, {}), { status: 400, code: 'INVALID_INPUT' });
    await assert.rejects(liveController.getLive({ query: { x: '1' } }, {}), { status: 400, code: 'INVALID_INPUT' });
});
