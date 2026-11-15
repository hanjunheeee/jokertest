'use strict';

// 끼우기(장착) DB 시험: 가진 것만·칸 종류·안 사도 끼우는 것·옛 revision·두 창 동시에·사진·테두리 한 번에·산 바로 뒤를 시험 DB 장착 줄로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-364~374 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

test.before(h.prepareDb);
test.after(h.closeDb);

const loadoutRowOf = (uuid) => h.models().EconomyLoadout.findOne({ where: { user_id: uuid }, raw: true });

// 화면이 처음 받는 장착 revision (가진 것 읽기, 기본 지급도 이때 됨)
const revisionOf = async (base, uuid) => {
    const res = await h.call(base, uuid, 'GET', `/economy/accounts/${uuid}/entitlements`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.loadout.revision;
};

const equip = (base, uuid, slot, itemId, expectedRevision) =>
    h.call(base, uuid, 'POST', '/economy/equip', { slot, itemId, expectedRevision });

// 공통 준비: 서버 · 골드 넉넉한 새 사람 · 처음 revision
const setup = async (t) => {
    const base = await h.startServer(t);
    const user = await h.createUser('eq');
    await h.fund(user, 'GOLD', 5000);
    const revision = await revisionOf(base, user);
    return { base, user, revision };
};

test('A12-B-364 산 테두리 끼우기 → 장착 칸 바뀜·revision 새 값 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);
    assert.equal((await h.buy(base, user, 'profile-border-남작')).status, 201);

    const res = await equip(base, user, 'PROFILE_BORDER', 'profile-border-남작', revision);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await loadoutRowOf(user);
    assert.equal(row.selected_profile_border_id, 'profile-border-남작');
    assert.notEqual(row.revision, revision);
    assert.equal(res.body.loadout.revision, row.revision);
});

test('A12-B-365 안 산 테두리 끼우기 → 403 ITEM_NOT_OWNED·장착 그대로 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);
    const before = await loadoutRowOf(user);

    const res = await equip(base, user, 'PROFILE_BORDER', 'profile-border-황제', revision);
    h.assertCode(res, 403, 'ITEM_NOT_OWNED');
    assert.deepEqual(await loadoutRowOf(user), before);
});

// ── A12-B-366~367 칸 종류가 다른 아이템 (가진 것이어도) ──
const MISMATCH = [
    { no: 'A12-B-366', label: '테두리 칸에 스킨', slot: 'PROFILE_BORDER', itemId: 'player-skin-광대1-불멸' },
    { no: 'A12-B-367', label: '광대 칸에 귀족 스킨', slot: 'JOB_SKIN_CLOWN', itemId: 'player-skin-귀족1-블러드' },
];

for (const c of MISMATCH) {
    test(`${c.no} ${c.label}(산 것) → 400 ITEM_TYPE_MISMATCH·장착 그대로 [지금 동작]`, async (t) => {
        if (h.noDb(t)) return;
        const { base, user, revision } = await setup(t);
        assert.equal((await h.buy(base, user, c.itemId)).status, 201);
        const before = await loadoutRowOf(user);

        const res = await equip(base, user, c.slot, c.itemId, revision);
        h.assertCode(res, 400, 'ITEM_TYPE_MISMATCH');
        assert.deepEqual(await loadoutRowOf(user), before);
    });
}

// ── A12-B-368~369 안 사도 끼우는 것 ──
const FREE = [
    { no: 'A12-B-368', label: '직업 기본 스킨', slot: 'JOB_SKIN_CLOWN', itemId: 'basic-skin-광대1', column: 'selected_skin_clown' },
    { no: 'A12-B-369', label: '기본 카드 테두리(베이스)', slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-베이스', column: 'selected_card_frame_id' },
];

for (const c of FREE) {
    test(`${c.no} ${c.label} 안 사고 끼우기 → 됨 [지금 동작]`, async (t) => {
        if (h.noDb(t)) return;
        const { base, user, revision } = await setup(t);

        const res = await equip(base, user, c.slot, c.itemId, revision);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal((await loadoutRowOf(user))[c.column], c.itemId);
    });
}

test('A12-B-370 옛 revision으로 저장 → 409 SKIN_REVISION_CONFLICT·장착 그대로', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);
    // 다른 창이 먼저 바꿈 → 처음 revision은 옛 값이 됨
    assert.equal((await equip(base, user, 'PLAYER_CARD_FRAME', 'player-card-베이스', revision)).status, 200);
    const before = await loadoutRowOf(user);

    const res = await equip(base, user, 'JOB_SKIN_CLOWN', 'basic-skin-광대2', revision);
    h.assertCode(res, 409, 'SKIN_REVISION_CONFLICT');
    assert.deepEqual(await loadoutRowOf(user), before);
});

test('A12-B-371 두 창이 같은 revision으로 동시에 → 하나만 됨·다른 하나 409', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);

    const answers = await Promise.all([
        equip(base, user, 'JOB_SKIN_CLOWN', 'basic-skin-광대1', revision),
        equip(base, user, 'JOB_SKIN_CLOWN', 'basic-skin-광대2', revision),
    ]);
    assert.deepEqual(answers.map((res) => res.status).sort(), [200, 409]);
    const winner = answers.find((res) => res.status === 200);
    assert.equal((await loadoutRowOf(user)).revision, winner.body.loadout.revision);
});

test('A12-B-372 /equip-profile 사진·테두리 둘 다 가진 것 → 두 칸 + revision 한 번 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);
    assert.equal((await h.buy(base, user, 'profile-border-남작')).status, 201);

    const res = await h.call(base, user, 'POST', '/economy/equip-profile', {
        photoItemId: 'player-profile-기사', borderItemId: 'profile-border-남작', expectedRevision: revision,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await loadoutRowOf(user);
    assert.equal(row.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(row.selected_profile_border_id, 'profile-border-남작');
    assert.notEqual(row.revision, revision);
    assert.equal(res.body.loadout.revision, row.revision);
});

test('A12-B-373 /equip-profile 둘 중 하나 안 가짐 → 403·두 칸 다 그대로 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);
    const before = await loadoutRowOf(user);

    const res = await h.call(base, user, 'POST', '/economy/equip-profile', {
        photoItemId: 'player-profile-기사', borderItemId: 'profile-border-자작', expectedRevision: revision,
    });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.deepEqual(await loadoutRowOf(user), before);
});

test('A12-B-374 구매 응답 바로 뒤 끼우기 → 됨 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, user, revision } = await setup(t);

    const bought = await h.buy(base, user, 'player-skin-광대2-카오스');
    assert.equal(bought.status, 201);
    const res = await equip(base, user, 'JOB_SKIN_CLOWN', 'player-skin-광대2-카오스', revision);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await loadoutRowOf(user)).selected_skin_clown, 'player-skin-광대2-카오스');
});
