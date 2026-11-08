'use strict';

// 이모티콘 팔레트 읽기·저장 시험 (가짜 DB, 진짜 DB 안 씀)
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../services/economy');
const { createFakeEconomyDb, seedWallet } = require('./fakeEconomyDb');

const DEFAULTS = [...economy.DEFAULT_EMOJI_SLOTS];

const rejectsWithCode = (promise, code, status) => assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
});

test('팔레트: 처음 읽으면 기본 이모티콘 8칸과 revision, 보유 8개가 나온다', async () => {
    const db = createFakeEconomyDb();
    const palette = await economy.getEmojiPalette('u', db);
    assert.deepEqual(palette.slots, DEFAULTS);
    assert.equal(typeof palette.revision, 'string');
    assert.equal(palette.owned.length, 8);
});

test('팔레트: 두 번 읽어도 revision이 그대로다 (읽기만으로 안 바뀜)', async () => {
    const db = createFakeEconomyDb();
    const a = await economy.getEmojiPalette('u', db);
    const b = await economy.getEmojiPalette('u', db);
    assert.equal(a.revision, b.revision);
});

test('팔레트 저장: revision 없으면 400 MISSING_EXPECTED_REVISION', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots: DEFAULTS }, db), 'MISSING_EXPECTED_REVISION', 400);
});

test('팔레트 저장: 본문 자체가 없으면 400 MISSING_EXPECTED_REVISION', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.saveEmojiPalette('u', undefined, db), 'MISSING_EXPECTED_REVISION', 400);
});

test('팔레트 저장: 7칸·9칸은 400 INVALID_SLOTS', async () => {
    const db = createFakeEconomyDb();
    const { revision } = await economy.getEmojiPalette('u', db);
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots: DEFAULTS.slice(0, 7), expectedRevision: revision }, db), 'INVALID_SLOTS', 400);
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots: [...DEFAULTS, null], expectedRevision: revision }, db), 'INVALID_SLOTS', 400);
});

test('팔레트 저장: slots가 배열이 아니면 400 INVALID_SLOTS', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots: 'emoji-basic-love', expectedRevision: 'r' }, db), 'INVALID_SLOTS', 400);
});

test('팔레트 저장: 빈 문자열 칸은 400 INVALID_SLOTS (빈 칸은 null만)', async () => {
    const db = createFakeEconomyDb();
    const slots = [...DEFAULTS];
    slots[3] = '';
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots, expectedRevision: 'r' }, db), 'INVALID_SLOTS', 400);
});

test('팔레트 저장: 숫자 칸은 400 INVALID_SLOTS', async () => {
    const db = createFakeEconomyDb();
    const slots = [...DEFAULTS];
    slots[0] = 1;
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots, expectedRevision: 'r' }, db), 'INVALID_SLOTS', 400);
});

test('팔레트 저장: 같은 이모티콘을 두 칸에 넣으면 400 INVALID_SLOTS', async () => {
    const db = createFakeEconomyDb();
    const slots = [...DEFAULTS];
    slots[1] = slots[0];
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots, expectedRevision: 'r' }, db), 'INVALID_SLOTS', 400);
});

test('팔레트 저장: 8칸 모두 null(빈 팔레트)도 저장된다', async () => {
    const db = createFakeEconomyDb();
    const { revision } = await economy.getEmojiPalette('u', db);
    const saved = await economy.saveEmojiPalette('u', { slots: Array(8).fill(null), expectedRevision: revision }, db);
    assert.deepEqual(saved.slots, Array(8).fill(null));
    assert.notEqual(saved.revision, revision);
    assert.deepEqual((await economy.getEmojiPalette('u', db)).slots, Array(8).fill(null));
});

test('팔레트 저장: 안 산 상점 이모티콘은 400 NOT_OWNED이고 팔레트 그대로', async () => {
    const db = createFakeEconomyDb();
    const { revision } = await economy.getEmojiPalette('u', db);
    const slots = [...DEFAULTS];
    slots[0] = 'emoji-shush';
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots, expectedRevision: revision }, db), 'NOT_OWNED', 400);
    assert.deepEqual((await economy.getEmojiPalette('u', db)).slots, DEFAULTS);
});

test('팔레트 저장: 이모티콘이 아닌 보유 아이템(사진) id도 NOT_OWNED로 거절', async () => {
    const db = createFakeEconomyDb();
    const { revision } = await economy.getEmojiPalette('u', db);
    const slots = [...DEFAULTS];
    slots[0] = 'player-profile-기사';
    await rejectsWithCode(economy.saveEmojiPalette('u', { slots, expectedRevision: revision }, db), 'NOT_OWNED', 400);
});

test('팔레트 저장: 산 상점 이모티콘은 넣을 수 있고 보유 목록에도 나온다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    await economy.purchaseItem({ userId: 'u', itemId: 'emoji-shush', referenceEventId: 'buy' }, db);
    const { revision, owned } = await economy.getEmojiPalette('u', db);
    assert.ok(owned.includes('emoji-shush'));
    const slots = [...DEFAULTS];
    slots[7] = 'emoji-shush';
    const saved = await economy.saveEmojiPalette('u', { slots, expectedRevision: revision }, db);
    assert.equal(saved.slots[7], 'emoji-shush');
});

test('팔레트 저장: 오래된 revision이면 409 REVISION_MISMATCH와 지금 칸·revision을 같이 준다', async () => {
    const db = createFakeEconomyDb();
    const { revision: old } = await economy.getEmojiPalette('u', db);
    const changed = [...DEFAULTS].reverse();
    const saved = await economy.saveEmojiPalette('u', { slots: changed, expectedRevision: old }, db);
    await assert.rejects(economy.saveEmojiPalette('u', { slots: DEFAULTS, expectedRevision: old }, db), (error) => {
        assert.equal(error.code, 'REVISION_MISMATCH');
        assert.equal(error.status, 409);
        assert.equal(error.revision, saved.revision);
        assert.deepEqual(error.slots, changed);
        return true;
    });
});

test('팔레트 저장: 같은 revision으로 두 저장이 동시에 오면 하나만 된다', async () => {
    const db = createFakeEconomyDb();
    const { revision } = await economy.getEmojiPalette('u', db);
    const results = await Promise.allSettled([
        economy.saveEmojiPalette('u', { slots: [...DEFAULTS].reverse(), expectedRevision: revision }, db),
        economy.saveEmojiPalette('u', { slots: Array(8).fill(null), expectedRevision: revision }, db),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'REVISION_MISMATCH');
});

test('팔레트 저장: 한 사람 팔레트 저장이 다른 사람 팔레트를 안 바꾼다', async () => {
    const db = createFakeEconomyDb();
    const a = await economy.getEmojiPalette('a', db);
    await economy.getEmojiPalette('b', db);
    await economy.saveEmojiPalette('a', { slots: Array(8).fill(null), expectedRevision: a.revision }, db);
    assert.deepEqual((await economy.getEmojiPalette('b', db)).slots, DEFAULTS);
});

test('팔레트 저장: 돌려준 slots는 넘긴 배열과 다른 복사본이다 (나중에 넘긴 배열을 바꿔도 결과 안 바뀜)', async () => {
    const db = createFakeEconomyDb();
    const { revision } = await economy.getEmojiPalette('u', db);
    const slots = [...DEFAULTS];
    const saved = await economy.saveEmojiPalette('u', { slots, expectedRevision: revision }, db);
    slots[0] = null;
    assert.equal(saved.slots[0], DEFAULTS[0]);
});
