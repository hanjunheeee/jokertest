'use strict';

// 시작 알림·스냅샷 값 시험 — 같은 직업 목록(allies), 남의 직업 안 샘, 내 직업·팀·스킨, 색·순서·사람 칸, 방 설정 칸
// 목록 A02-B-094~151 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "시작 알림·스냅샷 값")
const test = require('node:test');
const assert = require('node:assert/strict');

// 판 차리기 도우미 (맨 위에서 DB 주소를 닿지 않는 곳으로 막음)
const gf = require('../audit-2026-11-09/gameFixtures');
const gameSession = require('../../game-core/gameSession');
const { assertNoForbiddenPrivateData, collectOtherPlayerRoleSecrets } = require('../helpers/gameSession.testUtils');

test.beforeEach(() => gf.resetCore());
test.after(() => gf.resetCore());

// 보는 사람마다 시작 알림 / 역할 확인 단계 스냅샷
const startedFor = (session, uuid) => gameSession.buildGameStartedPayload(session, uuid);
const snapshotFor = (session, uuid) => gameSession.buildSessionSnapshot(session, uuid);
// 알림·스냅샷에서 내 칸 꺼내기 (시작 알림은 state.self, 스냅샷은 self)
const selfOfStarted = (session, uuid) => startedFor(session, uuid).state.self;
const selfOfSnapshot = (session, uuid) => snapshotFor(session, uuid).self;

// 판 차리기: 자동(jokerCount) 또는 직접(roleCounts), 직업은 randomFn 0으로 고정
const startGame = (id, { n, jokerCount = 1, roleCounts = null, settings = {}, extra = {} }) =>
    gf.startGame({ id, n, jokerCount, roleCounts, settings, extra });

// 9가지 판: 그 직업 사람이 받는 같은 직업 목록 기대값 (empty = [], partner = 상대만, none = 칸 없음)
const ALLY_CASES = [
    ['광대 1명(5명 J1C4)', { n: 5, jokerCount: 1 }, 'JOKER', 'empty'],
    ['광대 2명(5명 J2C3)', { n: 5, jokerCount: 2 }, 'JOKER', 'partner'],
    ['의사 1명(6명 자동)', { n: 6 }, 'DOCTOR', 'empty'],
    ['의사 2명(7명 J1D2)', { n: 7, roleCounts: { JOKER: 1, DOCTOR: 2 } }, 'DOCTOR', 'partner'],
    ['경비원 1명(8명 자동)', { n: 8 }, 'GUARD', 'empty'],
    ['경비원 2명(8명 J1G2)', { n: 8, roleCounts: { JOKER: 1, GUARD: 2 } }, 'GUARD', 'partner'],
    ['마녀사냥꾼 1명(10명 자동)', { n: 10 }, 'WITCH_HUNTER', 'empty'],
    ['마녀사냥꾼 2명(10명 J1W2)', { n: 10, roleCounts: { JOKER: 1, WITCH_HUNTER: 2 } }, 'WITCH_HUNTER', 'partner'],
    ['시민(10명 자동, 시민 6)', { n: 10 }, 'CITIZEN', 'none'],
];

// 그 직업 사람 전원의 같은 직업 목록이 기대대로인지
function checkAllies(session, role, expect, selfOf) {
    const holders = gf.byRole(session, role);
    assert.ok(holders.length > 0, `${role} 사람이 없음`);
    for (const uuid of holders) {
        const self = selfOf(session, uuid);
        if (expect === 'none') {
            assert.equal(Object.hasOwn(self, 'allies'), false, `${uuid}(${role})에게 allies 칸이 있음`);
            continue;
        }
        const partners = holders.filter((u) => u !== uuid);
        assert.deepEqual(self.allies, expect === 'empty' ? [] : partners, `${uuid}(${role}) 동료 목록`);
    }
}

// A02-B-094~102 시작 알림의 같은 직업 목록
ALLY_CASES.forEach(([label, opts, role, expect], i) => {
    const no = `A02-B-${String(94 + i).padStart(3, '0')}`;
    test(`${no} 시작 알림 같은 직업 목록 — ${label}`, () => {
        checkAllies(startGame(no, opts), role, expect, selfOfStarted);
    });
});

// A02-B-103~111 스냅샷(역할 확인 단계)의 같은 직업 목록
ALLY_CASES.forEach(([label, opts, role, expect], i) => {
    const no = `A02-B-${String(103 + i).padStart(3, '0')}`;
    test(`${no} 역할 확인 단계 스냅샷 같은 직업 목록 — ${label}`, () => {
        const session = startGame(no, opts);
        assert.equal(session.phase, 'ROLE_REVEAL');
        checkAllies(session, role, expect, selfOfSnapshot);
    });
});

// A02-B-112~117 같은 직업 목록에 다른 직업이 안 섞임 (보는 사람 전원)
const PAIRED = [
    ['A02-B-112', 5, { JOKER: 2, DOCTOR: 2 }, 'J2D2C1'],
    ['A02-B-113', 6, { JOKER: 2, DOCTOR: 2, GUARD: 2 }, 'J2D2G2'],
    ['A02-B-114', 7, { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 1 }, 'J2D2G2W1'],
    ['A02-B-115', 8, { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 'J2D2G2W2'],
    ['A02-B-116', 9, { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 'J2D2G2W2C1'],
    ['A02-B-117', 10, { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 'J2D2G2W2C2'],
];
for (const [no, n, roleCounts, label] of PAIRED) {
    test(`${no} ${n}명 ${label} → 보는 사람 전원 allies = 같은 직업 다른 사람뿐`, () => {
        const session = startGame(no, { n, roleCounts });
        for (const viewer of session.players.values()) {
            const self = selfOfStarted(session, viewer.uuid);
            if (viewer.role === 'CITIZEN') {
                assert.equal(Object.hasOwn(self, 'allies'), false, `시민 ${viewer.uuid}에게 allies 칸`);
                continue;
            }
            const sameRole = gf.byRole(session, viewer.role).filter((u) => u !== viewer.uuid);
            assert.deepEqual([...self.allies].sort(), sameRole.sort(), `${viewer.uuid}(${viewer.role}) 동료 목록`);
        }
    });
}

// 사람 목록 칸에 직업이 없고, 비밀 검사 도우미도 통과하는지 (보는 사람 전원)
// 도우미는 맨 위 self만 내 칸으로 봐서, 시작 알림은 self가 든 state를 넘김 (밖 칸은 gameId 하나뿐)
function checkNoLeak(session, build, rootOf) {
    for (const viewer of session.players.keys()) {
        const root = rootOf(build(session, viewer));
        for (const p of root.players) {
            assert.equal(Object.hasOwn(p, 'role'), false, `${viewer}가 받은 ${p.uuid} 칸에 직업`);
        }
        assertNoForbiddenPrivateData(root, collectOtherPlayerRoleSecrets(session, viewer));
    }
}

// A02-B-118~123 시작 알림에 남의 직업이 안 샘
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(118 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 시작 알림 → 사람 목록에 직업 없음, 비밀 검사 통과 (보는 사람 전원)`, () => {
        checkNoLeak(startGame(no, { n }), startedFor, (payload) => payload.state);
    });
}

// A02-B-124~129 역할 확인 단계 스냅샷에 남의 직업이 안 샘
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(124 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 역할 확인 단계 스냅샷 → 사람 목록에 직업 없음, 비밀 검사 통과 (보는 사람 전원)`, () => {
        checkNoLeak(startGame(no, { n }), snapshotFor, (payload) => payload);
    });
}

// A02-B-130~134 내 직업·팀 (10명 자동)
const ROLE_TEAM = [
    ['A02-B-130', '광대', 'JOKER', 'JOKER'],
    ['A02-B-131', '시민', 'CITIZEN', 'CITIZEN'],
    ['A02-B-132', '의사', 'DOCTOR', 'CITIZEN'],
    ['A02-B-133', '경비원', 'GUARD', 'CITIZEN'],
    ['A02-B-134', '마녀사냥꾼', 'WITCH_HUNTER', 'CITIZEN'],
];
for (const [no, label, role, team] of ROLE_TEAM) {
    test(`${no} 10명 자동, 보는 사람 ${label} → self.role ${role}, team ${team}`, () => {
        const session = startGame(no, { n: 10 });
        const self = selfOfStarted(session, gf.firstOf(session, role));
        assert.equal(self.role, role);
        assert.equal(self.team, team);
    });
}

test('A02-B-135 6명, 의사가 다섯 직업 스킨을 다 가짐 → 의사 스킨 하나만, 남의 칸엔 스킨 없음', () => {
    const session = startGame('A02-B-135', { n: 6 });
    const doctor = gf.firstOf(session, 'DOCTOR');
    // 시작 직전 외형 읽기가 붙이는 모양 그대로 (직업 스킨 id → 스킨)
    session.players.get(doctor).accountSkinsByJob = {
        noble: 'skin-noble', clown: 'skin-clown', doctor: 'skin-doctor', guard: 'skin-guard', witchHunter: 'skin-wh',
    };
    const mine = startedFor(session, doctor);
    assert.equal(mine.state.self.accountSkinId, 'skin-doctor');
    for (const viewer of session.players.keys()) {
        const payload = startedFor(session, viewer);
        for (const p of payload.state.players) assert.equal(Object.hasOwn(p, 'accountSkinId'), false, `${p.uuid} 칸에 스킨`);
        if (viewer === doctor) continue;
        assert.equal(JSON.stringify(payload).includes('skin-'), false, `${viewer} 알림에 의사 스킨 값이 샘`);
    }
});

// A02-B-136~138 판 안 색이 0~9 안, 서로 다름
for (const [no, n] of [['A02-B-136', 5], ['A02-B-137', 7], ['A02-B-138', 10]]) {
    test(`${no} ${n}명 → themeIndex 0~9 안, 서로 다름`, () => {
        const session = startGame(no, { n });
        const themes = startedFor(session, gf.firstOf(session, 'JOKER')).state.players.map((p) => p.themeIndex);
        assert.equal(themes.length, n);
        for (const t of themes) assert.ok(Number.isInteger(t) && t >= 0 && t <= 9, `색 번호 ${t}`);
        assert.equal(new Set(themes).size, n, `색이 겹침: ${themes.join(',')}`);
    });
}

// 알림의 사람 칸 → { uuid: 색 } (예 → { 'u-0': 3, 'u-1': 7 })
const themeMap = (players) => Object.fromEntries(players.map((p) => [p.uuid, p.themeIndex]));

test('A02-B-139 8명 각자의 시작 알림 → 사람마다 themeIndex 같음', () => {
    const session = startGame('A02-B-139', { n: 8 });
    const [first, ...rest] = [...session.players.keys()];
    const base = themeMap(startedFor(session, first).state.players);
    for (const viewer of rest) assert.deepEqual(themeMap(startedFor(session, viewer).state.players), base, `${viewer}가 받은 색`);
});

test('A02-B-140 6명 → 시작 알림·스냅샷 themeIndex 같음', () => {
    const session = startGame('A02-B-140', { n: 6 });
    for (const viewer of session.players.keys()) {
        assert.deepEqual(themeMap(snapshotFor(session, viewer).players), themeMap(startedFor(session, viewer).state.players));
    }
});

test('A02-B-141 9명 → players 순서가 판 사람 목록 순서, 누가 받아도 같음', () => {
    const session = startGame('A02-B-141', { n: 9 });
    const seats = [...session.players.keys()];
    for (const viewer of seats) assert.deepEqual(startedFor(session, viewer).state.players.map((p) => p.uuid), seats);
});

test('A02-B-142 5명 → 사람마다 닉네임·isAlive true·isParticipating true', () => {
    const session = startGame('A02-B-142', { n: 5 });
    const nicknames = new Map([...session.players.values()].map((p) => [p.uuid, p.nickname]));
    for (const p of startedFor(session, gf.firstOf(session, 'JOKER')).state.players) {
        assert.equal(p.nickname, nicknames.get(p.uuid));
        assert.equal(p.isAlive, true);
        assert.equal(p.isParticipating, true);
    }
});

test('A02-B-143 7명 → 시작 알림 phase ROLE_REVEAL, dayIndex 0', () => {
    const session = startGame('A02-B-143', { n: 7 });
    const { state } = startedFor(session, gf.firstOf(session, 'JOKER'));
    assert.equal(state.phase, 'ROLE_REVEAL');
    assert.equal(state.dayIndex, 0);
});

// A02-B-144~146 지운 방 설정 칸(불 꺼진 무도회·영혼의 베팅·투표 공개)이 시작 알림에 안 실림
for (const [no, key] of [['A02-B-144', 'lightsOut'], ['A02-B-145', 'soulBetting'], ['A02-B-146', 'voteReveal']]) {
    test(`${no} 방 설정에 ${key}가 있어도 (5명) → roomSettingsSource.settings에 그 칸 없음`, () => {
        const session = startGame(no, { n: 5, settings: { [key]: true } });
        const { settings } = startedFor(session, gf.firstOf(session, 'JOKER')).state.roomSettingsSource;
        assert.equal(Object.hasOwn(settings, key), false);
    });
}

test('A02-B-147 토론 90·투표 60·재판 45·밤 60초 (6명) → 시작 알림 설정 시간 4칸 같음', () => {
    const times = { dayDiscussionTime: 90, dayVoteTime: 60, tribunalTime: 45, nightActionTime: 60 };
    const session = startGame('A02-B-147', { n: 6, settings: times });
    const { settings } = startedFor(session, gf.firstOf(session, 'JOKER')).state.roomSettingsSource;
    for (const [key, seconds] of Object.entries(times)) assert.equal(settings[key], seconds, key);
});

// A02-B-148~151 10명 J2D2G2W2C2, 직업마다 목록 길이 1·자기 uuid 없음
const PAIR_ROLES = [
    ['A02-B-148', '광대', 'JOKER'],
    ['A02-B-149', '의사', 'DOCTOR'],
    ['A02-B-150', '경비원', 'GUARD'],
    ['A02-B-151', '마녀사냥꾼', 'WITCH_HUNTER'],
];
for (const [no, label, role] of PAIR_ROLES) {
    test(`${no} 10명 J2D2G2W2C2, ${label} 2명 → 목록 길이 1, 자기 uuid 없음`, () => {
        const session = startGame(no, { n: 10, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
        for (const uuid of gf.byRole(session, role)) {
            const { allies } = selfOfStarted(session, uuid);
            assert.equal(allies.length, 1, `${uuid} 목록 ${JSON.stringify(allies)}`);
            assert.equal(allies.includes(uuid), false, `${uuid} 목록에 자기 자신`);
        }
    });
}
