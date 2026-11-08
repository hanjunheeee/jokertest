'use strict';

// 장착(칸 하나·프로필 사진·테두리)·공개/게임 시작 장착 시험 (가짜 DB, 진짜 DB 안 씀)
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../services/economy');
const { createFakeEconomyDb, seedWallet } = require('./fakeEconomyDb');

const rejectsWithCode = (promise, code, status) => assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
});

const loadout = (db, userId) => db._inspect.loadouts.get(userId);
const currentRevision = async (db, userId) => (await economy.getWalletSummary(userId, db)).loadout.revision;
const buy = async (db, userId, itemId) => {
    seedWallet(db, userId, { gold: 10000 });
    await economy.purchaseItem({ userId, itemId, referenceEventId: `buy-${itemId}` }, db);
};

test('장착: 모르는 칸 이름은 400 UNKNOWN_EQUIP_SLOT', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'HAT', itemId: 'x' }, db), 'UNKNOWN_EQUIP_SLOT', 400);
});

test('장착: 소문자 칸 이름(profile_photo)도 모르는 칸으로 거절', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'profile_photo', itemId: 'x' }, db), 'UNKNOWN_EQUIP_SLOT', 400);
});

for (const slot of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    test(`장착: 물려받은 속성 이름(${slot})을 칸으로 보내면 500이 아니라 400 UNKNOWN_EQUIP_SLOT`, async () => {
        const db = createFakeEconomyDb();
        await rejectsWithCode(economy.equipItem({ userId: 'u', slot, itemId: 'player-profile-기사' }, db), 'UNKNOWN_EQUIP_SLOT', 400);
    });
}

test('장착: itemId가 빈 문자열이면 400 INVALID_ITEM_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: '' }, db), 'INVALID_ITEM_ID', 400);
});

test('장착: 기본 지급 사진은 사지 않아도 장착된다', async () => {
    const db = createFakeEconomyDb();
    await economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'player-profile-기사' }, db);
    assert.equal(loadout(db, 'u').selected_profile_photo_id, 'player-profile-기사');
});

test('장착: 공짜 카드 테두리(베이스)는 보유 없이 장착된다', async () => {
    const db = createFakeEconomyDb();
    await economy.equipItem({ userId: 'u', slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-베이스' }, db);
    assert.equal(loadout(db, 'u').selected_card_frame_id, 'player-card-베이스');
});

test('장착: 공짜 카드 테두리 id를 사진 칸에 넣으면 거절', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'player-card-베이스' }, db), 'ITEM_TYPE_MISMATCH', 400);
});

test('장착: 안 산 카드 테두리는 403 ITEM_NOT_OWNED이고 칸이 안 바뀐다', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-왕관' }, db), 'ITEM_NOT_OWNED', 403);
    assert.equal(loadout(db, 'u').selected_card_frame_id, null);
});

test('장착: 산 카드 테두리는 장착되고 revision이 새로 바뀐다', async () => {
    const db = createFakeEconomyDb();
    await buy(db, 'u', 'player-card-왕관');
    const before = await currentRevision(db, 'u');
    await economy.equipItem({ userId: 'u', slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-왕관', expectedRevision: before }, db);
    assert.equal(loadout(db, 'u').selected_card_frame_id, 'player-card-왕관');
    assert.notEqual(loadout(db, 'u').revision, before);
});

test('장착: 직업 기본 스킨은 그 직업 칸에만 들어간다', async () => {
    const db = createFakeEconomyDb();
    await economy.equipItem({ userId: 'u', slot: 'JOB_SKIN_CLOWN', itemId: 'basic-skin-광대2' }, db);
    assert.equal(loadout(db, 'u').selected_skin_clown, 'basic-skin-광대2');
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'JOB_SKIN_GUARD', itemId: 'basic-skin-광대2' }, db), 'ITEM_TYPE_MISMATCH', 400);
});

test('장착: 없는 번호의 기본 스킨(basic-skin-주치의2)은 거절', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'JOB_SKIN_DOCTOR', itemId: 'basic-skin-주치의2' }, db), 'ITEM_TYPE_MISMATCH', 400);
});

test('장착: 산 귀족 스킨을 광대 칸에 넣으면 ITEM_TYPE_MISMATCH', async () => {
    const db = createFakeEconomyDb();
    await buy(db, 'u', 'player-skin-귀족2-로코코');
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'JOB_SKIN_CLOWN', itemId: 'player-skin-귀족2-로코코' }, db), 'ITEM_TYPE_MISMATCH', 400);
});

test('장착: 산 마녀사냥꾼 스킨은 마녀사냥꾼 칸에 들어가고 지갑 요약에 그대로 보인다', async () => {
    const db = createFakeEconomyDb();
    await buy(db, 'u', 'player-skin-마녀사냥꾼-스팀펑크');
    await economy.equipItem({ userId: 'u', slot: 'JOB_SKIN_WITCH_HUNTER', itemId: 'player-skin-마녀사냥꾼-스팀펑크' }, db);
    const summary = await economy.getWalletSummary('u', db);
    assert.equal(summary.loadout.selectedSkinsByJob.witchHunter, 'player-skin-마녀사냥꾼-스팀펑크');
    assert.equal(summary.loadout.selectedSkinsByJob.noble, null);
});

test('장착: 테두리를 사진 칸에 넣으면 ITEM_TYPE_MISMATCH', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'profile-border-평민' }, db), 'ITEM_TYPE_MISMATCH', 400);
});

test('장착: 오래된 revision이면 409 SKIN_REVISION_CONFLICT이고 칸이 안 바뀐다', async () => {
    const db = createFakeEconomyDb();
    const old = await currentRevision(db, 'u');
    await economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'player-profile-기사', expectedRevision: old }, db);
    await rejectsWithCode(
        economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'player-profile-수녀', expectedRevision: old }, db),
        'SKIN_REVISION_CONFLICT', 409,
    );
    assert.equal(loadout(db, 'u').selected_profile_photo_id, 'player-profile-기사');
});

test('장착: 같은 revision으로 두 장착이 동시에 오면 하나만 된다', async () => {
    const db = createFakeEconomyDb();
    const rev = await currentRevision(db, 'u');
    const results = await Promise.allSettled([
        economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'player-profile-기사', expectedRevision: rev }, db),
        economy.equipItem({ userId: 'u', slot: 'PROFILE_PHOTO', itemId: 'player-profile-수녀', expectedRevision: rev }, db),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'SKIN_REVISION_CONFLICT');
});

test('프로필 장착: 사진·테두리 둘 다 안 보내면 400 EMPTY_PROFILE_EQUIP_REQUEST', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipProfileAppearance({ userId: 'u', expectedRevision: 'r' }, db), 'EMPTY_PROFILE_EQUIP_REQUEST', 400);
});

test('프로필 장착: revision 없으면 400 MISSING_EXPECTED_REVISION', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipProfileAppearance({ userId: 'u', photoItemId: 'player-profile-기사' }, db), 'MISSING_EXPECTED_REVISION', 400);
});

test('프로필 장착: 사진 id가 null이면 400 INVALID_ITEM_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.equipProfileAppearance({ userId: 'u', photoItemId: null, expectedRevision: 'r' }, db), 'INVALID_ITEM_ID', 400);
});

test('프로필 장착: 안 산 테두리와 같이 보내면 403이고 사진도 안 바뀐다', async () => {
    const db = createFakeEconomyDb();
    const rev = await currentRevision(db, 'u');
    await rejectsWithCode(economy.equipProfileAppearance({
        userId: 'u', photoItemId: 'player-profile-기사', borderItemId: 'profile-border-황제', expectedRevision: rev,
    }, db), 'ITEM_NOT_OWNED', 403);
    assert.equal(loadout(db, 'u').selected_profile_photo_id, 'player-profile-금빛가면');
});

test('프로필 장착: 업적으로 받은 직업 테두리는 장착된다', async () => {
    const db = createFakeEconomyDb();
    await economy.grantAchievementItem({ userId: 'u', itemId: 'profile-border-경비원', itemType: 'PROFILE_BORDER', referenceEventId: 'ach' }, db);
    const rev = await currentRevision(db, 'u');
    await economy.equipProfileAppearance({ userId: 'u', borderItemId: 'profile-border-경비원', expectedRevision: rev }, db);
    assert.equal(loadout(db, 'u').selected_profile_border_id, 'profile-border-경비원');
});

test('프로필 장착: 카드 테두리 칸 값은 건드리지 않는다', async () => {
    const db = createFakeEconomyDb();
    await economy.equipItem({ userId: 'u', slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-베이스' }, db);
    const rev = await currentRevision(db, 'u');
    await economy.equipProfileAppearance({ userId: 'u', photoItemId: 'player-profile-기사', expectedRevision: rev }, db);
    assert.equal(loadout(db, 'u').selected_card_frame_id, 'player-card-베이스');
});

test('공개 장착: 빈 목록·빈 id·숫자 id만 있으면 빈 객체', async () => {
    const db = createFakeEconomyDb();
    assert.deepEqual(await economy.getPublicProfileLoadouts([], db), {});
    assert.deepEqual(await economy.getPublicProfileLoadouts(['', 5, null], db), {});
});

test('공개 장착: 겹친 id는 한 번만, 사진·테두리 두 칸만 준다', async () => {
    const db = createFakeEconomyDb();
    const result = await economy.getPublicProfileLoadouts(['a', 'a', 'b'], db);
    assert.deepEqual(Object.keys(result).sort(), ['a', 'b']);
    assert.deepEqual(Object.keys(result.a).sort(), ['profileBorderId', 'profilePhotoId']);
    assert.equal(result.a.profilePhotoId, 'player-profile-금빛가면');
});

test('게임 시작 장착: 직업 스킨 묶음은 다섯 직업 칸을 모두 가진다', async () => {
    const db = createFakeEconomyDb();
    const result = await economy.getGameStartLoadouts(['a'], db);
    assert.deepEqual(Object.keys(result.a.skinsByJob).sort(), ['clown', 'doctor', 'guard', 'noble', 'witchHunter']);
    assert.equal(result.a.cardFrameId, null);
});

test('직업별 스킨 묶음: 장착 행이 없으면 다섯 칸 모두 null', () => {
    assert.deepEqual(economy.buildSkinsByJob(undefined), { noble: null, clown: null, guard: null, doctor: null, witchHunter: null });
});
