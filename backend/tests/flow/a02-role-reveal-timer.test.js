'use strict';

// 역할 확인 10초 시험 — 확인 눌러도 안 당겨지고 10초에 1일째 낮, 판마다 따로 셈, 역할 확인 중 채팅·투표 막힘·이모티콘 됨, 나감·끊김
// 목록 A02-B-213~232 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "역할 확인 10초"), 돌리기: node --env-file=.env.test --test tests/flow/a02-role-reveal-timer.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket 파일보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');

const MM = matchmaking.__testables;
const G = gs.__testables;

// 시계 시작 값 (가짜 시계)
const T0 = 1_000_000;

// ── 대기방 → 시작 세상 (이 파일 안에서만 씀, 공용으로 올릴 것) ──
// 가짜 시계(setTimeout·Date)를 시작 전에 켬 → 역할 확인 10초·낮 타이머가 모두 이 시계를 따름
function makeWorld(t, { depsOverrides = {} } = {}) {
    gf.resetCore();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    mf.installFakeMatchmakingDeps(matchmaking, depsOverrides);
    // 낮 표 기록·업적·전적 저장은 DB에 씀 → 아무것도 안 하는 함수로 바꿔 끼움
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    G.__setGameResultPersistForTests(async () => {});
    t.mock.method(Math, 'random', () => 0);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        gf.resetCore();
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        G.__setGameResultPersistForTests(null);
    });
    const sockets = new Map();
    // 계정 하나 접속 (접속 목록에 이 소켓을 지금 소켓으로 적음), 다시 붙을 땐 소켓 id를 새로
    const connect = (uuid, id = `sock-${uuid}`) => {
        const s = mf.createFakeSocket(uuid, { id });
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    const received = (uuid, event) => sock(uuid).received.filter((e) => e.event === event).map((e) => e.payload);

    // 방 만들기 → 나머지 코드 입장 → 전원 준비 (방장 = 첫 사람), 시간은 안 주면 60초
    async function openRoom({ prefix, n, jokerCount = 1, roleCounts = null, times = {} }) {
        const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of uuids) connect(uuid);
        const [host, ...guests] = uuids;
        const payload = {
            accessType: 'code', maxPlayers: n, jokerCount,
            dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60, ...times,
            ...(roleCounts ? { roleCompositionMode: 'custom', roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } } : {}),
        };
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, payload);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) {
            const r = await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        return { ...created.room, host, uuids };
    }

    // 방 열고 시작 → { uuids, gameId, startedAt, roles: uuid → 자기 직업 }
    async function openAndStart(opts) {
        const room = await openRoom(opts);
        const startedAt = Date.now();
        const reply = await mf.callAsPromise(MM.handleStartGame, io, sock(room.host), room.host, mf.startPayload(room));
        assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
        const roles = new Map(room.uuids.map((uuid) => [uuid, received(uuid, 'game_started').at(-1).state.self.role]));
        return { uuids: room.uuids, gameId: reply.gameId, startedAt, roles };
    }

    return { io, connect, sock, received, openAndStart };
}

// 가짜 시계 넘기기
const tick = (t, ms) => t.mock.timers.tick(ms);
// 그 직업 첫 사람
const firstWith = (game, role) => [...game.roles].find(([, r]) => r === role)[0];
// 화면이 보내는 것처럼 핸들러 부르고 답 받기
const ask = (handler, w, uuid, payload) => mf.callAsPromise(handler, w.io, w.sock(uuid), uuid, payload);
// 판 사람 전원이 지금까지 받은 사건 수 (새 알림이 왔는지 볼 때)
const totalReceived = (w, uuids) => uuids.reduce((sum, uuid) => sum + w.sock(uuid).received.length, 0);

test('A02-B-213 5명 시작, 시계 9,999ms → game_phase_changed 아무도 안 받음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b213', n: 5 });
    tick(t, 9_999);
    for (const uuid of g.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 0, uuid);
});

test('A02-B-214 5명 시작, 시계 10,000ms → 5명 모두 game_phase_changed 1번, 낮·1일째', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b214', n: 5 });
    tick(t, 10_000);
    for (const uuid of g.uuids) {
        const changed = w.received(uuid, 'game_phase_changed');
        assert.equal(changed.length, 1, uuid);
        assert.equal(changed[0].phase, 'DAY');
        assert.equal(changed[0].dayIndex, 1);
    }
});

test('A02-B-215 6명 모두 acknowledge_role_reveal, 시계 9,999ms → 낮 알림 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b215', n: 6 });
    for (const uuid of g.uuids) await ask(G.handleAcknowledgeRoleReveal, w, uuid, { gameId: g.gameId });
    tick(t, 9_999);
    for (const uuid of g.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 0, uuid);
});

test('A02-B-216 6명 중 1명 확인 → 답 { ok: true }', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b216', n: 6 });
    assert.deepEqual(await ask(G.handleAcknowledgeRoleReveal, w, g.uuids[2], { gameId: g.gameId }), { ok: true });
});

test('A02-B-217 7명 중 3명 확인, 시계 10,000ms → 7명 모두 낮 알림', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b217', n: 7 });
    for (const uuid of g.uuids.slice(0, 3)) await ask(G.handleAcknowledgeRoleReveal, w, uuid, { gameId: g.gameId });
    tick(t, 10_000);
    for (const uuid of g.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 1, uuid);
});

// A02-B-218~219 첫 낮 토론 마감 시각 = 시작 + 10초 + 토론 시간
for (const [no, seconds] of [['A02-B-218', 30], ['A02-B-219', 150]]) {
    test(`${no} 토론 ${seconds}초 (8명) → 낮 알림 마감 = 시작 + 10초 + ${seconds}초`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), n: 8, times: { dayDiscussionTime: seconds } });
        tick(t, 10_000);
        for (const uuid of g.uuids) {
            const [changed] = w.received(uuid, 'game_phase_changed');
            assert.ok(changed, `${uuid} 낮 알림 없음`);
            assert.equal(changed.dayPhaseDeadline, g.startedAt + 10_000 + seconds * 1_000);
        }
    });
}

test('A02-B-220 5명 판 A 시작, 4초 뒤 6명 판 B 시작 → A는 10초, B는 14초에 낮', async (t) => {
    const w = makeWorld(t);
    const a = await w.openAndStart({ prefix: 'b220a', n: 5 });
    tick(t, 4_000);
    const b = await w.openAndStart({ prefix: 'b220b', n: 6 });
    tick(t, 6_000); // 시계 10초
    for (const uuid of a.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 1, `A ${uuid}`);
    for (const uuid of b.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 0, `B ${uuid}`);
    tick(t, 3_999); // 시계 13.999초
    for (const uuid of b.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 0, `B ${uuid}`);
    tick(t, 1); // 시계 14초
    for (const uuid of b.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 1, `B ${uuid}`);
    for (const uuid of a.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 1, `A 두 번 받음 ${uuid}`);
});

test('A02-B-221 5명, 첫 낮 뒤 acknowledge_role_reveal → 답 ok, 판 누구에게도 새 알림 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b221', n: 5 });
    tick(t, 10_000);
    const before = totalReceived(w, g.uuids);
    const reply = await ask(G.handleAcknowledgeRoleReveal, w, g.uuids[1], { gameId: g.gameId });
    assert.equal(reply.ok, true);
    assert.equal(totalReceived(w, g.uuids), before);
});

test('A02-B-222 6명 중 1명이 확인 두 번 → 둘 다 ok, 10초 전 낮 아님', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b222', n: 6 });
    assert.equal((await ask(G.handleAcknowledgeRoleReveal, w, g.uuids[3], { gameId: g.gameId })).ok, true);
    assert.equal((await ask(G.handleAcknowledgeRoleReveal, w, g.uuids[3], { gameId: g.gameId })).ok, true);
    tick(t, 9_999);
    for (const uuid of g.uuids) assert.equal(w.received(uuid, 'game_phase_changed').length, 0, uuid);
});

test('A02-B-223 10명 → 10명이 받은 낮 알림 마감 시각 같은 값', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b223', n: 10 });
    tick(t, 10_000);
    const deadlines = g.uuids.map((uuid) => w.received(uuid, 'game_phase_changed')[0]?.dayPhaseDeadline);
    assert.ok(Number.isFinite(deadlines[0]), '마감 시각 없음');
    assert.equal(new Set(deadlines).size, 1, `마감 시각이 다름: ${deadlines.join(',')}`);
});

// 판 사람 누구라도 채팅 사건(이름에 chat)을 받았는지
const anyChatReceived = (w, uuids) => uuids.some((uuid) => w.sock(uuid).received.some((e) => /chat/i.test(e.event)));

test('A02-B-224 7명 역할 확인 중, 산 시민 submit_game_chat_message → 거절, 아무도 채팅 알림 못 받음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b224', n: 7 });
    const reply = await ask(G.handleSubmitGameChatMessage, w, firstWith(g, 'CITIZEN'), { gameId: g.gameId, text: '안녕' });
    assert.equal(reply.ok, false);
    assert.equal(anyChatReceived(w, g.uuids), false);
});

test('A02-B-225 7명 역할 확인 중, 산 광대 submit_joker_chat_message → 거절, 아무도 채팅 알림 못 받음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b225', n: 7 });
    const reply = await ask(G.handleSubmitJokerChatMessage, w, firstWith(g, 'JOKER'), { gameId: g.gameId, text: '안녕' });
    assert.equal(reply.ok, false);
    assert.equal(anyChatReceived(w, g.uuids), false);
});

// A02-B-226~227 역할 확인 중 이모티콘 됨 (팔레트에 넣은 이모티콘, 전원 같은 팔레트)
for (const [no, n] of [['A02-B-226', 5], ['A02-B-227', 10]]) {
    test(`${no} ${n}명 역할 확인 중, 팔레트에 있는 이모티콘 send_emoji → 판 전원 emoji_shown`, async (t) => {
        const palette = { slots: ['emo-1', null], owned: ['emo-1'] };
        const w = makeWorld(t, {
            depsOverrides: {
                economyService: {
                    getPublicProfileLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
                    getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
                    getEmojiPalettes: async (ids) => new Map(ids.map((id) => [id, palette])),
                    getEmojiPalette: async () => palette,
                },
            },
        });
        const g = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), n });
        const reply = await ask(G.handleSendEmoji, w, g.uuids[1], { gameId: g.gameId, itemId: 'emo-1' });
        assert.equal(reply.ok, true, `이모티콘 거절: ${reply.code}`);
        for (const uuid of g.uuids) {
            const shown = w.received(uuid, 'emoji_shown');
            assert.equal(shown.length, 1, uuid);
            assert.equal(shown[0].itemId, 'emo-1');
        }
    });
}

// A02-B-228~229 역할 확인 중 투표·준비 거절, 단계 그대로
const VOTE_CASES = [
    ['A02-B-228', 'cast_day_vote', G.handleSubmitDayVote, (g) => ({ gameId: g.gameId, targetId: g.uuids[0] })],
    ['A02-B-229', 'ready_for_day_vote', G.handleAcknowledgeDayVoteReady, (g) => ({ gameId: g.gameId })],
];
for (const [no, event, handler, payloadOf] of VOTE_CASES) {
    test(`${no} 6명 역할 확인 중 ${event} → 거절, 단계 그대로`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), n: 6 });
        const reply = await ask(handler, w, g.uuids[2], payloadOf(g));
        assert.equal(reply.ok, false);
        const snap = await ask(G.handleGetSessionSnapshot, w, g.uuids[2], { gameId: g.gameId });
        assert.equal(snap.ok, true);
        assert.equal(snap.phase, 'ROLE_REVEAL');
        assert.equal(snap.dayIndex, 0);
    });
}

test('A02-B-230 6명 중 시민 1명 leave_game_session → 나머지 5명 참여 변경 알림, 10초에 낮', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b230', n: 6 });
    const leaver = firstWith(g, 'CITIZEN');
    const rest = g.uuids.filter((u) => u !== leaver);
    assert.equal((await ask(G.handleLeaveGameSession, w, leaver, { gameId: g.gameId })).ok, true);
    for (const uuid of rest) {
        const changed = w.received(uuid, 'session_participation_changed');
        assert.equal(changed.length, 1, uuid);
        assert.equal(changed[0].departedUuid, leaver);
    }
    tick(t, 10_000);
    for (const uuid of rest) {
        const [day] = w.received(uuid, 'game_phase_changed');
        assert.ok(day, `${uuid} 낮 알림 없음`);
        assert.equal(day.phase, 'DAY');
        assert.equal(day.dayIndex, 1);
    }
});

test('A02-B-231 5명 J1C4 역할 확인 중 광대가 나가 광대 0명 → 판 끝, 시민 승', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b231', n: 5 });
    const joker = firstWith(g, 'JOKER');
    const rest = g.uuids.filter((u) => u !== joker);
    assert.equal((await ask(G.handleLeaveGameSession, w, joker, { gameId: g.gameId })).ok, true);
    for (const uuid of rest) {
        const [eliminated] = w.received(uuid, 'player_eliminated');
        assert.ok(eliminated, `${uuid} 판 끝 알림 없음`);
        assert.equal(eliminated.phase, 'ENDED');
        assert.equal(eliminated.winResult?.winner, 'CITIZEN');
    }
});

test('A02-B-232 7명 중 의사 1명 끊김 → 10초에 낮 그대로, 낮에 다시 붙어 스냅샷 → 낮·1일째·자기 직업 의사', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b232', n: 7 });
    const doctor = firstWith(g, 'DOCTOR');
    const old = w.sock(doctor);
    // 접속 때처럼 게임 사건 등록(연결 주인 기록) → 끊김
    gs.registerGameHandlers(w.io, old, doctor);
    old.connected = false;
    await gs.onDisconnect(w.io, old, doctor);
    tick(t, 10_000);
    for (const uuid of g.uuids.filter((u) => u !== doctor)) {
        const [day] = w.received(uuid, 'game_phase_changed');
        assert.ok(day, `${uuid} 낮 알림 없음`);
        assert.equal(day.dayIndex, 1);
    }
    // 새 소켓으로 다시 붙음 → 판 채널 다시 넣기 → 스냅샷
    const fresh = w.connect(doctor, `sock-${doctor}-2`);
    await gs.resyncSessionRouting(fresh, doctor, w.io);
    const snap = await ask(G.handleGetSessionSnapshot, w, doctor, { gameId: g.gameId });
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.phase, 'DAY');
    assert.equal(snap.dayIndex, 1);
    assert.equal(snap.self.role, 'DOCTOR');
});
