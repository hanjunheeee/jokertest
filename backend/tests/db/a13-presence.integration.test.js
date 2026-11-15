'use strict';

// 접속 줄 DB 시험 — 접속하면 한 사람 한 줄(ONLINE·지금·서버 이름), 끊기면 OFFLINE, 서버 켤 때 남은 접속 되돌림, 서버 이름 빈 옛 줄은 1시간 기준
// 목록 A13-B-386~390 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-presence.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser } = W;
const presence = require('../../socket/connection/presence');
const presenceService = require('../../services/presence/status');
const emitter = require('../../socket/emitter');
const cluster = require('../../cluster');
const mf = require('../helpers/matchmakingFixtures');
const noDb = W.useTestDb(test);

// 접속 세상: 가짜 io, 접속 목록은 서버 진짜 목록
function makeWorld(t) {
    const io = mf.createFakeIo([]);
    emitter.setIo(io);
    emitter.onlineUsers.clear();
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    let seq = 0;
    return {
        async connect(uuid) {
            seq += 1;
            const s = mf.createFakeSocket(uuid, { id: `a13pd-${uuid.slice(0, 8)}-${seq}` });
            s.disconnect = () => { s.connected = false; };
            s.data.user = { uuid, sessionId: `sess-${uuid}` };
            io.sockets.sockets.set(s.id, s);
            await presence.handleConnection(io, s, uuid);
            return s;
        },
        async disconnect(uuid, s) {
            s.connected = false;
            await presence.handleDisconnect(io, s, uuid);
        },
    };
}
const rowsOf = (uuid) => db.OnlinePresence.findAll({ where: { user_id: uuid }, raw: true });
const statusOf = async (uuid) => (await db.OnlinePresence.findByPk(uuid, { raw: true })).status;

test('A13-B-386 접속 → online_presence ONLINE·last_active_at 지금·server_id = 이 서버 이름(없으면 main), 두 번 접속해도 1줄', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const me = await createUser('me');
    const before = Date.now() - 2_000;
    await w.connect(me);
    await w.connect(me);
    const rows = await rowsOf(me);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'ONLINE');
    const at = new Date(rows[0].last_active_at).getTime();
    assert.ok(at >= before && at <= Date.now() + 2_000, `last_active_at이 지금이 아님: ${rows[0].last_active_at}`);
    assert.equal(rows[0].server_id, cluster.serverId());
    if (!process.env.SERVER_ID) assert.equal(rows[0].server_id, 'main');
});

test('A13-B-387 끊기면 → OFFLINE', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const me = await createUser('me');
    const s = await w.connect(me);
    await w.disconnect(me, s);
    assert.equal(await statusOf(me), 'OFFLINE');
});

test('A13-B-388 켜기 전 활동한 이 서버 ONLINE 줄 2 → 서버 켤 때 OFFLINE', async (t) => {
    if (noDb(t)) return;
    const bootAt = new Date();
    const people = [await createUser('a'), await createUser('b')];
    for (const uuid of people) {
        await db.OnlinePresence.create({ user_id: uuid, status: 'ONLINE', last_active_at: new Date(bootAt.getTime() - 60_000), server_id: cluster.serverId() });
    }
    await presenceService.resetPresencesOnBoot(bootAt);
    for (const uuid of people) assert.equal(await statusOf(uuid), 'OFFLINE');
});

// A13-B-389~390 서버 이름 빈 옛 줄: 켤 때 기준 분 전 활동
for (const [no, minutes, expected] of [['A13-B-389', 59, 'ONLINE'], ['A13-B-390', 61, 'OFFLINE']]) {
    test(`${no} 서버 이름 빈 옛 줄 ${minutes}분 전 활동 → ${expected === 'ONLINE' ? '그대로 ONLINE' : 'OFFLINE'}`, async (t) => {
        if (noDb(t)) return;
        const bootAt = new Date();
        const uuid = await createUser('old');
        await db.OnlinePresence.create({ user_id: uuid, status: 'ONLINE', last_active_at: new Date(bootAt.getTime() - minutes * 60_000), server_id: null });
        await presenceService.resetPresencesOnBoot(bootAt);
        assert.equal(await statusOf(uuid), expected);
    });
}
