'use strict';

// 알림 준비 신호 흐름 시험(시험 DB 씀) — 처음 신호에 환영 안내 하나, 다시 접속해도 안 늘어남
// 목록 A13-B-113~114 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-notify-ready.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { createUser } = W;
const { registerNotificationHandlers } = require('../../socket/connection/notifications');
const emitter = require('../../socket/emitter');
const mf = require('../helpers/matchmakingFixtures');

const noDb = W.useTestDb(test);

// 계정 하나 접속: 접속 목록에 지금 소켓으로 적고 알림 준비 사건 받기 등록
function connect(t, io, uuid, n) {
    const s = mf.createFakeSocket(uuid, { id: `a13n-${uuid.slice(0, 8)}-${n}` });
    s.rooms.add(emitter.userChannelOf(uuid));
    io.sockets.sockets.set(s.id, s);
    emitter.onlineUsers.set(uuid, s.id);
    registerNotificationHandlers(s, uuid);
    return s;
}
const ready = (s) => new Promise((resolve) => s.trigger('notifications_ready', {}, resolve));
const created = (s) => s.received.filter((e) => e.event === 'notification_created').map((e) => e.payload);

function makeIo(t) {
    const io = mf.createFakeIo([]);
    emitter.setIo(io);
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    return io;
}

test('A13-B-113 처음 notifications_ready → 답 { ok: true, created: true }, notification_created 1번(제목 "알림 기능 안내", 효과음 system-notification)', async (t) => {
    if (noDb(t)) return;
    const io = makeIo(t);
    const me = await createUser('ready');
    const s = connect(t, io, me, 1);
    assert.deepEqual(await ready(s), { ok: true, created: true });
    const got = created(s);
    assert.equal(got.length, 1);
    assert.equal(got[0].notification.title, '알림 기능 안내');
    assert.equal(got[0].sfxEvent.kind, 'system-notification');
});

test('A13-B-114 같은 계정 두 번째 notifications_ready → { ok: true, created: false }, notification_created 0번', async (t) => {
    if (noDb(t)) return;
    const io = makeIo(t);
    const me = await createUser('ready');
    assert.equal((await ready(connect(t, io, me, 1))).created, true);
    // 다시 접속 (새 소켓)
    const again = connect(t, io, me, 2);
    assert.deepEqual(await ready(again), { ok: true, created: false });
    assert.equal(created(again).length, 0);
});
