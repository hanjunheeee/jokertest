'use strict';

// 방 만들기 흐름 시험 — 정원×공개 방식, 정원 4·11 거절(개발 환경 포함), 방 이름·방장·준비·코드·버전·구성·시간 저장, 지운 3칸, 이미 방·판에 있음, 연달아·끊김·프로필 실패
// 목록 A01-B-062~097 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "방 만들기 흐름"), 돌리기: node --env-file=.env.test --test tests/flow/a01a-create-room.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { makeWorld, customRoles } = require('./a01a-world');

const BAD_MAX_MESSAGE = '최대 플레이어 수가 올바르지 않습니다.';
const REMOVED_KEYS = [['lightsOut', true], ['soulBetting', true], ['voteReveal', false]];

// ── 정원 5~10 × 공개/코드로 방이 생김 ──
let no = 62;
for (const maxPlayers of [5, 6, 7, 8, 9, 10]) {
    for (const accessType of ['open', 'code']) {
        const id = `A01-B-${String(no).padStart(3, '0')}`;
        no += 1;
        test(`${id} 정원 ${maxPlayers} · ${accessType}로 create_room → ok, 답 정원·공개 방식이 보낸 값, 명단 1명`, async (t) => {
            const w = makeWorld(t);
            const host = `c${maxPlayers}${accessType}`;
            w.connect(host);
            const reply = await w.create(host, { maxPlayers, accessType });
            assert.equal(reply.ok, true, reply.message);
            assert.equal(reply.room.settings.maxPlayers, maxPlayers);
            assert.equal(reply.room.accessType, accessType);
            assert.equal(reply.room.players.length, 1);
            assert.equal(reply.room.players[0].uuid, host);
        });
    }
}

// ── 정원 4·11 거절 ──
for (const [id, maxPlayers] of [['A01-B-074', 4], ['A01-B-075', 11]]) {
    test(`${id} 정원 ${maxPlayers} → ok:false "${BAD_MAX_MESSAGE}", get_current_room에 방 없음`, async (t) => {
        const w = makeWorld(t);
        w.connect('host');
        const reply = await w.create('host', { maxPlayers });
        assert.equal(reply.ok, false);
        assert.equal(reply.message, BAD_MAX_MESSAGE);
        assert.equal(await w.currentRoom('host'), null);
    });
}

test('A01-B-076 NODE_ENV=development + GAME_DEV_MIN_PLAYERS=1에서도 정원 4 → 거절', async (t) => {
    const w = makeWorld(t, { env: { NODE_ENV: 'development', GAME_DEV_MIN_PLAYERS: '1' } });
    w.connect('host');
    const reply = await w.create('host', { maxPlayers: 4 });
    assert.equal(reply.ok, false);
    assert.equal(reply.message, BAD_MAX_MESSAGE);
    assert.equal(await w.currentRoom('host'), null);
});

test('A01-B-077 닉네임 "가나다" 계정이 만듦 → room 제목·공개 목록 title = "가나다의 방"', async (t) => {
    const w = makeWorld(t, { depsOverrides: { userRepository: { findByUuid: async (uuid) => ({ uuid, nickname: '가나다' }) } } });
    w.connect('host');
    const reply = await w.create('host', { accessType: 'open' });
    assert.equal(reply.ok, true, reply.message);
    const listed = (await w.publicRooms('host')).rooms.find((r) => r.id === reply.room.roomId);
    assert.equal(listed?.title, '가나다의 방');
    assert.equal(reply.room.title, '가나다의 방', '방 만들기 답의 room에 방 이름이 없음');
});

test('A01-B-078 방장 = 만든 사람 → room.hostUuid = 만든 사람 uuid', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.room.hostUuid, 'maker');
});

test('A01-B-079 방장도 준비 안 됨으로 시작 → 명단 isReady:false, canStart:false', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.room.players[0].isReady, false);
    assert.equal(reply.room.canStart, false);
});

test('A01-B-080 방 코드 6자리 → room.roomCode가 대문자·숫자 6자리', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.ok, true, reply.message);
    assert.match(reply.room.roomCode, /^[A-Z0-9]{6}$/);
});

// 방 200개 만들기 (사람마다 하나) → 코드 목록
async function create200(w, prefix) {
    const codes = [];
    for (let i = 0; i < 200; i += 1) {
        const uuid = `${prefix}-${i}`;
        w.connect(uuid);
        const reply = await w.create(uuid);
        assert.equal(reply.ok, true, reply.message);
        codes.push(reply.room.roomCode);
    }
    return codes;
}

test('A01-B-081 [지금 동작] 방 200개 → 어느 코드에도 I·O·0·1 없음', async (t) => {
    const w = makeWorld(t);
    const codes = await create200(w, 'b081');
    assert.deepEqual(codes.filter((c) => /[IO01]/.test(c)), []);
});

test('A01-B-082 방 200개 → 코드 200개 다 다름', async (t) => {
    const w = makeWorld(t);
    const codes = await create200(w, 'b082');
    assert.equal(new Set(codes).size, 200);
});

// 코드 뽑기가 쓰는 6바이트 무작위를 정한 순서로 (다 쓰면 진짜 무작위), 글자표 A=0 B=1 … M=11
function scriptRoomCodeBytes(t, sequence) {
    const original = crypto.randomBytes.bind(crypto);
    const queue = [...sequence];
    t.mock.method(crypto, 'randomBytes', (size, ...rest) => {
        if (size === 6 && queue.length > 0) return Buffer.from(queue.shift());
        return original(size, ...rest);
    });
    return { push: (...items) => queue.push(...items) };
}
const ABCDEF = [0, 1, 2, 3, 4, 5];
const GHJKLM = [6, 7, 8, 9, 10, 11];

test('A01-B-083 5명 판 진행 중(코드 ABCDEF), 코드 뽑기가 처음 ABCDEF를 냄 → 새 방 코드가 ABCDEF 아님', async (t) => {
    const w = makeWorld(t);
    const bytes = scriptRoomCodeBytes(t, [ABCDEF]);
    const room = await w.openRoom({ prefix: 'b083', n: 5, maxPlayers: 5 });
    assert.equal(room.roomCode, 'ABCDEF');
    const started = await w.start(room.host);
    assert.equal(started.ok, true, started.message);
    bytes.push(ABCDEF, GHJKLM);
    w.connect('newbie');
    const reply = await w.create('newbie');
    assert.equal(reply.ok, true, reply.message);
    assert.notEqual(reply.room.roomCode, 'ABCDEF');
});

test('A01-B-084 [지금 동작] 설정 버전 처음 값 → room.settingsVersion = 1', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.room.settingsVersion, 1);
});

test('A01-B-085 구성 방식 안 보냄 → room.settings.roleCompositionMode = auto, roleCounts 없음', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.room.settings.roleCompositionMode, 'auto');
    assert.equal(Object.hasOwn(reply.room.settings, 'roleCounts'), false);
});

test('A01-B-086 custom + J1D1G1W0 → room.settings.roleCounts = 그 값', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker', customRoles({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }));
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.room.settings.roleCompositionMode, 'custom');
    assert.deepEqual(reply.room.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 });
});

test('A01-B-087 토론 150·투표 90·재판 120·밤 120 → 답 설정에 그대로', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const reply = await w.create('maker', { dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
    assert.equal(reply.ok, true, reply.message);
    const s = reply.room.settings;
    assert.deepEqual(
        [s.dayDiscussionTime, s.dayVoteTime, s.tribunalTime, s.nightActionTime],
        [150, 90, 120, 120],
    );
});

// ── 지운 3칸 실은 요청도 방이 생김 ──
for (const [i, [key, value]] of REMOVED_KEYS.entries()) {
    const id = `A01-B-0${88 + i}`;
    test(`${id} ${key}: ${value} 실은 create_room → ok, 답 room.settings·공개 목록 settings에 ${key} 없음`, async (t) => {
        const w = makeWorld(t);
        w.connect('maker');
        const reply = await w.create('maker', { accessType: 'open', [key]: value });
        assert.equal(reply.ok, true, reply.message);
        assert.equal(Object.hasOwn(reply.room.settings, key), false);
        const listed = (await w.publicRooms('maker')).rooms.find((r) => r.id === reply.room.roomId);
        assert.ok(listed, '공개 목록에 방이 없음');
        assert.equal(Object.hasOwn(listed.settings, key), false);
    });
}

test('A01-B-091 3칸 실어 만든 방, 5명 전원 준비 → 시작 → 다섯 사람 game_started에 3칸 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b091', n: 5, lightsOut: true, soulBetting: true, voteReveal: false });
    const started = await w.start(room.host);
    assert.equal(started.ok, true, started.message);
    for (const uuid of room.uuids) {
        const [payload] = w.received(uuid, 'game_started');
        assert.ok(payload, `${uuid}가 game_started를 못 받음`);
        const text = JSON.stringify(payload);
        for (const [key] of REMOVED_KEYS) assert.equal(text.includes(`"${key}"`), false, `${uuid} 시작 알림에 ${key}`);
    }
});

test('A01-B-092 방에 든 사람이 또 create_room → "이미 참여 중인 방이 있습니다.", 방 1개 그대로', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const first = await w.create('maker', { accessType: 'open' });
    assert.equal(first.ok, true, first.message);
    const second = await w.create('maker', { accessType: 'open' });
    assert.equal(second.ok, false);
    assert.equal(second.message, '이미 참여 중인 방이 있습니다.');
    const rooms = (await w.publicRooms('maker')).rooms;
    assert.deepEqual(rooms.map((r) => r.id), [first.room.roomId]);
    assert.equal((await w.currentRoom('maker')).roomId, first.room.roomId);
});

test('A01-B-093 진행 중 5명 판에 산 채로 있음 → code ALREADY_IN_GAME + gameId', async (t) => {
    const w = makeWorld(t);
    const uuids = ['b093-0', 'b093-1', 'b093-2', 'b093-3', 'b093-4'];
    const session = w.mf.seedActiveGameForAccount(uuids, { roomId: 'room-b093' });
    w.connect('b093-0');
    const reply = await w.create('b093-0');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ALREADY_IN_GAME');
    assert.equal(reply.gameId, session.id);
    assert.equal(await w.currentRoom('b093-0'), null);
});

test('A01-B-094 진행 중 6명 판에서 죽은 사람 → 방 만들어짐', async (t) => {
    const w = makeWorld(t);
    const s = w.gf.startGame({ id: 'b094', n: 6 });
    w.gf.toDay(s);
    w.gf.toNight(s);
    // 광대가 시민 하나를 죽이고 의사는 건너뜀 (6명 자동 구성 = 광대 1·의사 1·시민 4)
    const joker = w.gf.firstOf(s, 'JOKER');
    const doctor = w.gf.firstOf(s, 'DOCTOR');
    const victim = w.gf.firstOf(s, 'CITIZEN');
    w.gf.resolveNightDirect(s, { [joker]: victim, [doctor]: null });
    assert.equal(s.players.get(victim).alive, false);
    assert.notEqual(s.phase, 'ENDED');
    w.connect(victim);
    const reply = await w.create(victim);
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.room.hostUuid, victim);
});

test('A01-B-095 첫 답 오기 전 create_room 두 번 → 둘째 "이미 처리 중인 요청이 있습니다.", 방 1개', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    const [a, b] = await Promise.all([w.create('maker', { accessType: 'open' }), w.create('maker', { accessType: 'open' })]);
    assert.equal(a.ok, true, a.message);
    assert.equal(b.ok, false);
    assert.equal(b.message, '이미 처리 중인 요청이 있습니다.');
    assert.equal((await w.publicRooms('maker')).rooms.length, 1);
});

test('A01-B-096 [지금 동작] 계정 읽는 사이 소켓 끊김 → "연결이 끊어져 방을 생성하지 못했습니다.", 방 없음', async (t) => {
    let openGate;
    const gate = new Promise((resolve) => { openGate = resolve; });
    let reading;
    const reached = new Promise((resolve) => { reading = resolve; });
    const w = makeWorld(t, {
        depsOverrides: {
            userRepository: { findByUuid: async (uuid) => { reading(); await gate; return { uuid, nickname: `닉-${uuid}` }; } },
        },
    });
    w.connect('maker');
    const pending = w.create('maker', { accessType: 'open' });
    await reached;
    w.sock('maker').connected = false;
    openGate();
    const reply = await pending;
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '연결이 끊어져 방을 생성하지 못했습니다.');
    assert.equal(await w.currentRoom('maker'), null);
    assert.deepEqual((await w.publicRooms('maker')).rooms, []);
});

test('A01-B-097 [지금 동작] 프로필 읽기가 던짐 → "방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.", 흔적 없음, 바로 다시 만들면 됨', async (t) => {
    let failOnce = true;
    const w = makeWorld(t, {
        depsOverrides: {
            economyService: {
                getPublicProfileLoadouts: async (ids) => {
                    if (failOnce) { failOnce = false; throw new Error('프로필 읽기 실패(시험)'); }
                    return Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]));
                },
                getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
                getEmojiPalettes: async (ids) => new Map(ids.map((id) => [id, { slots: [], owned: [] }])),
                getEmojiPalette: async () => ({ slots: [], owned: [] }),
            },
        },
    });
    t.mock.method(console, 'error', () => {});
    w.connect('maker');
    const reply = await w.create('maker', { accessType: 'open' });
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.');
    assert.equal(await w.currentRoom('maker'), null);
    assert.deepEqual((await w.publicRooms('maker')).rooms, []);
    assert.deepEqual(w.sock('maker').rooms.size, 0, '실패한 방 채널이 남음');
    const again = await w.create('maker', { accessType: 'open' });
    assert.equal(again.ok, true, again.message);
});
