'use strict';

// 회원 탈퇴 뒤 DB에 남는 것 시험(시험 DB, 진짜 경로) — 계정 줄 바꿈·세션 끊김·소셜 연결·친구 쪽·대기 초대·재설정/인증 줄·전적 이름·지갑/장부/동의 남음·다시 가입·한 덩어리·판 중 거절
// 목록 A11-B-856~867 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb } = h;
const { Op } = db.Sequelize;
// 지갑 모델은 경제 모델 파일이 db에 안 올려 연결 목록에서 꺼냄
const Wallet = db.sequelize.models.EconomyWallet;

test.before(h.prepareDb);
test.after(h.closeDb);

// 비번 계정 + 로그인 세션
async function loggedIn(t, prefix = 'x') {
    const app = await h.startApp(t);
    const user = await h.createLocalUser({ prefix });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

const withdraw = (app, user, session) => app.post('/user/me/withdraw', { password: user.password }, { cookie: session.cookie });

// a 둘레 친구 쪽 줄: b와 친구·즐겨찾기·차단(양쪽 방향), c에게 보낸 신청, d에게서 받은 신청
// 대기 신청은 두 사람 사이 하나만 되는 칸이라(방향 상관없이) 보낸·받은 신청 상대를 따로 둠
async function linkFriends(a, [b, c, d]) {
    await db.Friendship.create({ requester_id: a, receiver_id: b, status: 'ACCEPTED' });
    await db.FriendRequest.create({ requester_id: a, receiver_id: c, status: 'PENDING' });
    await db.FriendRequest.create({ requester_id: d, receiver_id: a, status: 'PENDING' });
    await db.FriendFavorite.create({ owner_id: a, friend_id: b });
    await db.FriendFavorite.create({ owner_id: b, friend_id: a });
    await db.FriendBlock.create({ owner_id: a, blocked_id: b });
    await db.FriendBlock.create({ owner_id: b, blocked_id: a });
}

// 상대 셋 (친구·보낸 신청·받은 신청)
async function partners(prefix) {
    const out = [];
    for (let i = 0; i < 3; i += 1) out.push((await h.createLocalUser({ prefix })).uuid);
    return out;
}

// 그 사람이 들어간 친구 쪽 줄 수 (어느 방향이든)
async function friendRowsOf(uuid) {
    const either = (x, y) => ({ [Op.or]: [{ [x]: uuid }, { [y]: uuid }] });
    return {
        friendships: await db.Friendship.count({ where: either('requester_id', 'receiver_id') }),
        requests: await db.FriendRequest.count({ where: either('requester_id', 'receiver_id') }),
        favorites: await db.FriendFavorite.count({ where: either('owner_id', 'friend_id') }),
        blocks: await db.FriendBlock.count({ where: either('owner_id', 'blocked_id') }),
    };
}

// 대기 초대 하나 (보낸 사람 → 받는 사람)
async function pendingInvite(sender, receiver) {
    const id = crypto.randomUUID();
    await db.GameInvite.create({
        id,
        sender_id: sender,
        receiver_id: receiver,
        room_id: `room-${h.tail()}`,
        room_instance_id: `inst-${h.tail()}`,
        boot_epoch: 'a11b-boot',
        creation_key: `key-${h.tail()}`,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    return id;
}

// 세션 줄 상태 (끊김 = is_online false + revoked_at 있음)
const sessionRows = (uuid) => db.UserSession.findAll({ where: { user_id: uuid }, raw: true });

test('A11-B-856 탈퇴 → users: WITHDRAWN·withdrawn-<uuid>@withdrawn.invalid·탈퇴+uuid 32자·생일·사진 비움·deleted_at 채움', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await db.User.update({ profile_image_url: 'https://example.com/a11b.png' }, { where: { uuid: user.uuid } });
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    const row = await h.userRow(user.uuid);
    assert.equal(row.status, 'WITHDRAWN');
    assert.equal(row.email, `withdrawn-${user.uuid}@withdrawn.invalid`);
    assert.equal(row.nickname, `탈퇴${user.uuid.replace(/-/g, '')}`);
    assert.equal(row.nickname.length, 2 + 32);
    assert.equal(row.birth_date, null);
    assert.equal(row.profile_image_url, null);
    assert.notEqual(row.deleted_at, null);
});

test('A11-B-857 세션 3개 있던 계정 탈퇴 → 그 계정 세션 줄 전부 끊김 표시', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await h.otherDeviceSession(user.uuid);
    await h.otherDeviceSession(user.uuid);
    const before = await sessionRows(user.uuid);
    assert.equal(before.filter((r) => Boolean(r.is_online) && r.revoked_at === null).length, 3, '준비: 살아 있는 세션 3개');
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    const after = await sessionRows(user.uuid);
    assert.equal(after.length, 3);
    for (const row of after) {
        assert.equal(Boolean(row.is_online), false, `세션 ${row.id} 접속 중 표시`);
        assert.notEqual(row.revoked_at, null, `세션 ${row.id} 끊김 시각 없음`);
    }
});

test('A11-B-858 디스코드 연결 있던 계정 탈퇴 → 그 계정 소셜 연결 줄 0', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await db.ExternalIdentity.create({ provider: 'discord', subject: `sub-${h.tail()}`, user_id: user.uuid, email_snapshot: user.email });
    assert.equal(await db.ExternalIdentity.count({ where: { user_id: user.uuid } }), 1, '준비: 연결 있음');
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    assert.equal(await db.ExternalIdentity.count({ where: { user_id: user.uuid } }), 0);
});

test('A11-B-859 친구·보낸 신청·받은 신청·즐겨찾기·차단 있던 계정 탈퇴 → 그 계정이 들어간 줄 0 (상대 쪽 줄도)', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const others = await partners('xp');
    await linkFriends(user.uuid, others);
    assert.deepEqual(await friendRowsOf(user.uuid), { friendships: 1, requests: 2, favorites: 2, blocks: 2 }, '준비: 친구 쪽 줄');
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    assert.deepEqual(await friendRowsOf(user.uuid), { friendships: 0, requests: 0, favorites: 0, blocks: 0 });
    // 상대 쪽에서 본 줄도 없음
    for (const other of others) assert.deepEqual(await friendRowsOf(other), { friendships: 0, requests: 0, favorites: 0, blocks: 0 });
});

test('A11-B-860 보낸·받은 대기 초대가 있던 계정 탈퇴 → 그 초대가 대기 아님', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const partner = await h.createLocalUser({ prefix: 'xi' });
    const sent = await pendingInvite(user.uuid, partner.uuid);
    const received = await pendingInvite(partner.uuid, user.uuid);
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    for (const id of [sent, received]) {
        const row = await db.GameInvite.findByPk(id, { raw: true });
        assert.ok(row, '초대 줄이 없어짐');
        assert.notEqual(row.status, 'PENDING', `초대 ${id} 대기 그대로`);
    }
});

test('A11-B-861 열린 재설정 토큰·이메일 바꾸기 인증 줄이 있던 계정 탈퇴 → 그 줄 0', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'xr');
    assert.equal((await app.post('/auth/password-reset/request', { email: user.email })).status, 200, '준비: 재설정 요청');
    const newEmail = `a11b-xr-new-${h.tail()}@example.com`;
    const code = await app.post('/user/me/email/code', { newEmail, currentPassword: user.password }, { cookie: session.cookie });
    assert.equal(code.status, 200, `준비: 이메일 바꾸기 번호 ${code.body?.code}`);
    assert.equal(await db.PasswordResetToken.count({ where: { user_id: user.uuid } }), 1, '준비: 재설정 토큰 줄');
    const changeRows = () => db.SignupEmailVerification.count({ where: { email: newEmail, purpose: 'EMAIL_CHANGE' } });
    assert.equal(await changeRows(), 1, '준비: 이메일 바꾸기 인증 줄');
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    assert.equal(await db.PasswordResetToken.count({ where: { user_id: user.uuid } }), 0, '재설정 토큰 줄이 남음');
    assert.equal(await changeRows(), 0, '이메일 바꾸기 인증 줄이 남음');
});

test('A11-B-862 판 기록(5명 판)이 있던 계정 탈퇴 → 그 판 기록 이름 칸 "탈퇴한 사용자"', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const others = [];
    for (let i = 0; i < 4; i += 1) others.push(await h.createLocalUser({ prefix: 'xg' }));
    const gameId = crypto.randomUUID();
    await db.GameResult.create({
        id: gameId, started_at: new Date(Date.now() - 600_000), ended_at: new Date(), winner: 'CITIZEN',
        day_index: 2, player_count: 5, settings: null, completed: true,
    });
    const seats = [user, ...others];
    for (const [i, seat] of seats.entries()) {
        await db.GameResultPlayer.create({
            game_id: gameId, user_id: seat.uuid, nickname_snapshot: seat.nickname,
            role: i === 0 ? 'JOKER' : 'CITIZEN', team: i === 0 ? 'JOKER' : 'CITIZEN', won: i !== 0, is_alive: i !== 0,
        });
    }
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    const rows = await db.GameResultPlayer.findAll({ where: { game_id: gameId }, raw: true });
    assert.equal(rows.length, 5);
    assert.equal(rows.find((r) => r.user_id === user.uuid).nickname_snapshot, '탈퇴한 사용자');
    // 다른 사람 이름은 그대로
    for (const other of others) assert.equal(rows.find((r) => r.user_id === other.uuid).nickname_snapshot, other.nickname);
});

test('A11-B-863 탈퇴 → 지갑·장부·약관 동의 줄 uuid 그대로 남음', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const terms = await db.TermsVersion.create({
        kind: 'SERVICE', version: `a11b-${h.tail()}`, title: '시험 약관', effective_at: new Date(Date.now() - 60_000),
    });
    await db.UserTermsAgreement.create({ user_id: user.uuid, terms_version_id: terms.id });
    const counts = async () => ({
        wallets: await Wallet.count({ where: { user_id: user.uuid } }),
        ledger: await db.EconomyLedgerEntry.count({ where: { user_id: user.uuid } }),
        terms: await db.UserTermsAgreement.count({ where: { user_id: user.uuid } }),
    });
    const before = await counts();
    assert.ok(before.wallets >= 1 && before.ledger >= 1 && before.terms === 1, `준비: 지갑·장부·동의 있음 ${JSON.stringify(before)}`);
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    assert.deepEqual(await counts(), before);
});

test('A11-B-864 탈퇴 → 같은 이메일 가입 → 새 uuid 계정, 옛 지갑과 안 이어짐', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'xe');
    // 옛 지갑에 골드를 넣어 둠 (이어지면 새 계정에 보임)
    const [updated] = await Wallet.update({ balance_gold: 777 }, { where: { user_id: user.uuid } });
    assert.equal(updated, 1, '준비: 옛 지갑 있음');
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    const again = await h.createLocalUser({ email: user.email, prefix: 'xe' });
    assert.notEqual(again.uuid, user.uuid);
    assert.equal((await h.userRow(again.uuid)).email, user.email);
    // 새 계정 지갑은 0부터 (없으면 0), 옛 지갑은 옛 uuid에 그대로
    const newWallet = await Wallet.findOne({ where: { user_id: again.uuid }, raw: true });
    assert.equal(newWallet?.balance_gold ?? 0, 0);
    assert.equal((await Wallet.findOne({ where: { user_id: user.uuid }, raw: true })).balance_gold, 777);
});

test('A11-B-865 탈퇴 → 같은 닉네임으로 다시 가입 → 됨', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'xn');
    assert.equal((await withdraw(app, user, session)).status, 200, '준비: 탈퇴');
    const again = await h.createLocalUser({ nickname: user.nickname, prefix: 'xn' });
    assert.equal(again.nickname, user.nickname);
    assert.notEqual(again.uuid, user.uuid);
});

test('A11-B-866 탈퇴 중 지우기 한 단계를 시험이 실패하게 함 → 500류, 계정 ACTIVE·친구·세션 전부 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const others = await partners('xf');
    await linkFriends(user.uuid, others);
    const friendsBefore = await friendRowsOf(user.uuid);
    // 차단 줄 지우기에서 DB가 실패한 것처럼 (그 앞 단계 세션·소셜·친구·신청·즐겨찾기 지우기는 이미 지난 뒤)
    t.mock.method(db.FriendBlock, 'destroy', async () => { throw new Error('a11b 시험이 넣은 실패'); });
    const res = await withdraw(app, user, session);
    db.FriendBlock.destroy.mock.restore();
    assert.ok(res.status >= 500, `500류 아님: ${res.status}`);
    const row = await h.userRow(user.uuid);
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.email, user.email);
    assert.equal(row.deleted_at, null);
    assert.deepEqual(await friendRowsOf(user.uuid), friendsBefore);
    const sessions = await sessionRows(user.uuid);
    assert.ok(sessions.some((r) => r.id === session.sessionId && Boolean(r.is_online) && r.revoked_at === null), '세션이 끊김');
    assert.equal((await app.get('/user/me/profile', { cookie: session.cookie })).status, 200);
});

test('A11-B-867 6명 판 중 409 거절 뒤 → users·친구·세션 줄 그대로', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, 'xq');
    const others = await partners('xq');
    await linkFriends(user.uuid, others);
    t.after(h.resetGames);
    h.seatInGame(user.uuid, 6, `B-867-${h.tail()}`);
    const userBefore = await h.userRow(user.uuid);
    const friendsBefore = await friendRowsOf(user.uuid);
    const sessionsBefore = await sessionRows(user.uuid);
    const res = await withdraw(app, user, session);
    assert.equal(res.status, 409, '준비: 판 중 거절');
    assert.deepEqual(await h.userRow(user.uuid), userBefore);
    assert.deepEqual(await friendRowsOf(user.uuid), friendsBefore);
    assert.deepEqual(await sessionRows(user.uuid), sessionsBefore);
});
