'use strict';

// 끼우기 몸 검사 시험: 진짜 경로(POST /economy/equip·/equip-profile)에 몸 보내고 거절 코드와 장착 그대로인지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-247~251 (돌리기: node --env-file=.env.test --test tests/flow/a12-equip-request.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 서버 + 장착 읽어 둔 사람 (revision 받음)
const setup = async (t) => {
    const base = await w.startApp(t);
    const { db } = w.economyDb(t);
    const me = w.uid('a12-equip');
    const cookie = w.login(me);
    const loadout = await w.call(base, 'GET', `/economy/accounts/${me}/entitlements`, { cookie });
    assert.equal(loadout.status, 200, '준비: 가진 것·장착 읽기');
    const post = (path, body) => w.call(base, 'POST', path, { cookie, body });
    return { db, post, revision: loadout.body.loadout.revision };
};

// 400 + 코드(주면), 장착·가진 것 그대로
const assertRejected = async (c, path, body, code) => {
    const before = w.economyState(c.db);
    const res = await c.post(path, body);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    if (code) assert.equal(res.body.code, code);
    assert.equal(w.economyState(c.db), before, '장착이 바뀜');
};

test('A12-B-247 /equip 칸 이름 모름 → 400 UNKNOWN_EQUIP_SLOT', async (t) => {
    const c = await setup(t);
    await assertRejected(c, '/economy/equip', { slot: 'HAT', itemId: 'player-card-베이스', expectedRevision: c.revision }, 'UNKNOWN_EQUIP_SLOT');
});

test('A12-B-248 /equip itemId 없음 → 400', async (t) => {
    const c = await setup(t);
    await assertRejected(c, '/economy/equip', { slot: 'PLAYER_CARD_FRAME', expectedRevision: c.revision }, null);
});

test('A12-B-249 /equip expectedRevision 없음 → 400 MISSING_EXPECTED_REVISION', async (t) => {
    const c = await setup(t);
    await assertRejected(c, '/economy/equip', { slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-베이스' }, 'MISSING_EXPECTED_REVISION');
});

test('A12-B-250 /equip-profile 빈 몸 → 400', async (t) => {
    const c = await setup(t);
    await assertRejected(c, '/economy/equip-profile', {}, null);
});

test('A12-B-251 /equip-profile 모르는 칸 → 400', async (t) => {
    const c = await setup(t);
    await assertRejected(c, '/economy/equip-profile', { photoItemId: 'player-profile-기사', expectedRevision: c.revision, frameItemId: 'x' }, null);
});
