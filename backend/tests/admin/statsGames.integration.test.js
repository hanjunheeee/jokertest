'use strict';

// 통계·지난 판 통합 시험 (AD-220·230·231), 진짜 시험 DB + 관리자 경로
// npm run test:with-db -- tests/admin/statsGames.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');

let dbHandle = null;
let app = null;
test.before(async () => {
    dbHandle = await prepareAdminDb();
    if (dbHandle) app = await adminTestApp();
});
test.after(async () => {
    if (app) await app.close();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const sql = (text, replacements) => db().sequelize.query(text, { replacements });
// 날 SQL에 넣는 시각은 UTC 글자로 (Date는 PC 시간대로 바뀜)
const utc = (at) => new Date(at).toISOString().slice(0, 19).replace('T', ' ');

// 회원 한 명 (가입 시각을 정해서)
const makeUser = async (createdAt = new Date()) => {
    const uuid = crypto.randomUUID();
    await db().User.create({ uuid, password_hash: 'x', nickname: `s${uuid.slice(0, 7)}`, email: `s-${uuid}@example.com` });
    await sql('UPDATE users SET created_at = :at WHERE uuid = :uuid', { at: utc(createdAt), uuid });
    return uuid;
};

const makeGame = async ({ endedAt, minutes = 20, winner = 'CITIZEN', winReason = 'ALL_JOKERS_DEAD', players = [] }) => {
    const id = crypto.randomUUID();
    const ended = new Date(endedAt);
    await db().GameResult.create({
        id, started_at: new Date(ended.getTime() - minutes * 60_000), ended_at: ended, winner, win_reason: winReason,
        day_index: 3, player_count: players.length, completed: winReason !== 'MAINTENANCE',
    });
    for (const player of players) {
        await db().GameResultPlayer.create({
            game_id: id, user_id: player.uuid, nickname_snapshot: player.nickname ?? '가면', role: player.role ?? 'CITIZEN',
            team: player.team ?? 'CITIZEN', won: player.won ?? null, is_alive: player.alive ?? true, death_reason: player.deathReason ?? null,
        });
    }
    return id;
};

const makeOrder = (userId, { at, amount, status }) => sql(`INSERT INTO economy_topup_orders
    (order_id, user_id, product_id, version, pay_amount, grant_amount, bonus_amount, order_name, status, created_at, updated_at)
    VALUES (:id, :userId, 'dia-100', 1, :amount, 100, 0, '다이아', :status, :at, :at)`, {
    id: `ord_${crypto.randomBytes(6).toString('hex')}`, userId, amount, status, at: utc(at),
});

const snapshot = (at, total, serverId) => db().ConcurrentSnapshot.create({
    captured_at: new Date(at), total, lobby: total, in_game: 0, room_count: 0, server_id: serverId,
});

test('AD-220: 날짜별 가입·최고 접속(Node 합)·판·매출(환불 뺌) 정확, 빈 날 0', async (t) => {
    if (skipWithoutDb(t)) return;
    // 가입: 한국 3/1 0시 · 3/1 23:59:59 · 3/2 0시
    await makeUser('2020-02-29T15:00:00Z');
    await makeUser('2020-03-01T14:59:59Z');
    const buyer = await makeUser('2020-03-01T15:00:00Z');
    // 접속: 3/1 같은 분 n1 5 + n2 7 = 12, 다른 분 n1 20, n1 한 분에 두 번(3·4) → 3/1 최고 20 / 3/2 3+4 = 7
    await snapshot('2020-03-01T01:00:05Z', 5, 'n1');
    await snapshot('2020-03-01T01:00:40Z', 7, 'n2');
    await snapshot('2020-03-01T02:00:00Z', 20, 'n1');
    await snapshot('2020-03-01T03:00:01Z', 3, 'n1');
    await snapshot('2020-03-01T03:00:31Z', 4, 'n1');
    await snapshot('2020-03-02T05:10:00Z', 3, 'n1');
    await snapshot('2020-03-02T05:10:30Z', 4, 'n2');
    // 판: 3/1 둘, 3/3 23:30 하나, 3/4 0시(기간 밖) 하나
    await makeGame({ endedAt: '2020-03-01T03:00:00Z' });
    await makeGame({ endedAt: '2020-03-01T10:00:00Z' });
    await makeGame({ endedAt: '2020-03-03T14:30:00Z' });
    await makeGame({ endedAt: '2020-03-03T15:00:00Z' });
    // 주문: 3/2 지급 5000·3000, 환불 2000, 실패 9999
    await makeOrder(buyer, { at: '2020-03-02T01:00:00Z', amount: 5000, status: 'GRANTED' });
    await makeOrder(buyer, { at: '2020-03-02T02:00:00Z', amount: 3000, status: 'GRANTED' });
    await makeOrder(buyer, { at: '2020-03-02T03:00:00Z', amount: 2000, status: 'REFUNDED' });
    await makeOrder(buyer, { at: '2020-03-02T04:00:00Z', amount: 9999, status: 'FAILED' });

    const res = await app.agent.get('/admin-api/stats?from=2020-03-01&to=2020-03-03');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.days, [
        { date: '2020-03-01', signups: 2, peakOnline: 20, games: 2, revenueKrw: 0, refundsKrw: 0 },
        { date: '2020-03-02', signups: 1, peakOnline: 7, games: 0, revenueKrw: 8000, refundsKrw: 2000 },
        { date: '2020-03-03', signups: 0, peakOnline: 0, games: 1, revenueKrw: 0, refundsKrw: 0 },
    ]);

    const bad = await app.agent.get('/admin-api/stats?from=2020-03-03&to=2020-03-01');
    assert.deepEqual([bad.status, bad.body.code], [400, 'INVALID_RANGE']);
});

test('AD-230: 회원·날짜로 판 찾기(늦은 판부터·커서), 상세 참가자·직업·승패·시간, 점검으로 끝남', async (t) => {
    if (skipWithoutDb(t)) return;
    const alice = await makeUser();
    const bob = await makeUser();
    const first = await makeGame({
        endedAt: '2021-05-01T03:00:00Z',
        players: [
            { uuid: alice, nickname: '앨리스', role: 'JOKER', team: 'JOKER', won: true, alive: true },
            { uuid: bob, nickname: '밥', role: 'POLICE', team: 'CITIZEN', won: false, alive: false, deathReason: 'ASSASSINATION' },
        ],
    });
    const maintenance = await makeGame({
        endedAt: '2021-05-03T03:00:00Z', minutes: 7, winner: 'NONE', winReason: 'MAINTENANCE',
        players: [{ uuid: alice, nickname: '앨리스', role: 'DOCTOR', team: 'CITIZEN', won: null }],
    });
    await makeGame({ endedAt: '2021-05-02T03:00:00Z', players: [{ uuid: bob, nickname: '밥' }] });

    const mine = await app.agent.get(`/admin-api/games?userUuid=${alice}`);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.items.map((item) => item.gameId), [maintenance, first]);
    assert.equal(mine.body.nextBefore, null);
    assert.deepEqual(mine.body.items[0], {
        gameId: maintenance, startedAt: '2021-05-03T02:53:00.000Z', endedAt: '2021-05-03T03:00:00.000Z',
        winner: 'NONE', winReason: 'MAINTENANCE', playerCount: 1, dayIndex: 3,
    });

    // 50줄씩 대신 1줄씩 → 커서로 다음 쪽
    const page1 = await app.agent.get(`/admin-api/games?userUuid=${alice}&limit=1`);
    assert.deepEqual([page1.body.items.length, page1.body.nextBefore], [1, maintenance]);
    const page2 = await app.agent.get(`/admin-api/games?userUuid=${alice}&limit=1&before=${page1.body.nextBefore}`);
    assert.deepEqual(page2.body.items.map((item) => item.gameId), [first]);

    // 한국 날짜 5/2~5/3 → 그 이틀 판만
    const ranged = await app.agent.get('/admin-api/games?from=2021-05-02&to=2021-05-03');
    assert.equal(ranged.body.items.length, 2);
    assert.ok(!ranged.body.items.some((item) => item.gameId === first));

    const detail = await app.agent.get(`/admin-api/games/${first}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.game.durationSec, 20 * 60);
    assert.equal(detail.body.game.completed, true);
    const byName = Object.fromEntries(detail.body.players.map((player) => [player.nickname, player]));
    assert.deepEqual(byName['앨리스'], { uuid: alice, nickname: '앨리스', role: 'JOKER', team: 'JOKER', won: true, alive: true, deathReason: null });
    assert.deepEqual(byName['밥'], { uuid: bob, nickname: '밥', role: 'POLICE', team: 'CITIZEN', won: false, alive: false, deathReason: 'ASSASSINATION' });

    const ended = await app.agent.get(`/admin-api/games/${maintenance}`);
    assert.equal(ended.body.game.winReason, 'MAINTENANCE');
    assert.equal(ended.body.players[0].won, null);

    const badQuery = await app.agent.get('/admin-api/games?userUuid=nope');
    assert.deepEqual([badQuery.status, badQuery.body.code, badQuery.body.field], [400, 'INVALID_INPUT', 'userUuid']);
});

test('AD-231: 없는 판·모양 틀린 판 번호 → 404 GAME_NOT_FOUND', async (t) => {
    if (skipWithoutDb(t)) return;
    for (const gameId of [crypto.randomUUID(), 'not-a-game']) {
        const res = await app.agent.get(`/admin-api/games/${gameId}`);
        assert.deepEqual([res.status, res.body.ok, res.body.code], [404, false, 'GAME_NOT_FOUND']);
    }
});
