'use strict';

// 내 계정 정보·프로필·닉네임 시험(시험 DB, 진짜 경로) — 계정 정보(비번 유무)·통계 없는 계정·승률 = 직업 통계 합·판 수 등은 user_stats·최고 승률 직업 한글 이름·닉네임 바꾸기 규칙
// 목록 A11-B-801~818 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const h = require('./a11b-harness');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb } = h;
const bannedWords = require('../../services/ops/bannedWords');

test.before(h.prepareDb);
test.after(h.closeDb);

async function loggedIn(t, { prefix = 'm', social = false } = {}) {
    const app = await h.startApp(t);
    const user = social ? await h.createSocialUser({ prefix }) : await h.createLocalUser({ prefix });
    const session = await h.sessionFor(user.uuid);
    return { app, user, session };
}

const profile = (app, session) => app.get('/user/me/profile', { cookie: session.cookie });
const rename = (app, session, nickname) => app.patch('/user/me/nickname', { nickname }, { cookie: session.cookie });

// 판 기록 한 판 넣기 (직업·이김), 판 설정 없음 = 정식 판
async function recordGame(uuid, nickname, role, won) {
    const gameId = crypto.randomUUID();
    await db.GameResult.create({
        id: gameId, started_at: new Date(Date.now() - 600_000), ended_at: new Date(), winner: won ? role : 'OTHER',
        day_index: 2, player_count: 5, settings: null, completed: true,
    });
    await db.GameResultPlayer.create({
        game_id: gameId, user_id: uuid, nickname_snapshot: nickname, role,
        team: role === 'JOKER' ? 'JOKER' : 'CITIZEN', won, is_alive: true,
    });
}

// ── 계정 정보 (801~802) ──

test('A11-B-801 GET /user/me/account 비번 계정 → { email, hasLocalPassword: true }', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await app.get('/user/me/account', { cookie: session.cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { email: user.email, hasLocalPassword: true });
});

test('A11-B-802 GET /user/me/account 소셜 전용 → hasLocalPassword: false', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t, { social: true, prefix: 'ms' });
    const res = await app.get('/user/me/account', { cookie: session.cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { email: user.email, hasLocalPassword: false });
});

// ── 프로필 통계 (803~807) ──

test('A11-B-803 새 계정 프로필 → total_games 0·account_win_rate 0·survival_count 0·execution_count 0·most_played_role null', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const res = await profile(app, session);
    assert.equal(res.status, 200);
    const { data } = res.body;
    assert.equal(data.total_games, 0);
    assert.equal(data.account_win_rate, 0);
    assert.equal(data.survival_count, 0);
    assert.equal(data.execution_count, 0);
    assert.equal(data.most_played_role, null);
});

test('A11-B-804 직업 통계 광대 1승 2판 + 시민 2승 2판 → account_win_rate 0.75', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await recordGame(user.uuid, user.nickname, 'JOKER', true);
    await recordGame(user.uuid, user.nickname, 'JOKER', false);
    await recordGame(user.uuid, user.nickname, 'CITIZEN', true);
    await recordGame(user.uuid, user.nickname, 'CITIZEN', true);
    const res = await profile(app, session);
    assert.equal(res.body.data.account_win_rate, 0.75);
});

test('A11-B-805 직업 통계 0판 → account_win_rate 0', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    // 판 수 칸만 있고 직업 통계 판은 없음
    await db.UserStats.update({ total_games: 3 }, { where: { user_id: user.uuid } });
    const res = await profile(app, session);
    assert.equal(res.body.data.account_win_rate, 0);
});

test('A11-B-806 user_stats 판 수 7·생존 3·처형 2, 직업 통계 판 합 4 → 응답 7·3·2', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await db.UserStats.update({ total_games: 7, survival_count: 3, execution_count: 2 }, { where: { user_id: user.uuid } });
    for (let i = 0; i < 4; i += 1) await recordGame(user.uuid, user.nickname, 'CITIZEN', i % 2 === 0);
    const { data } = (await profile(app, session)).body;
    assert.equal(data.total_games, 7);
    assert.equal(data.survival_count, 3);
    assert.equal(data.execution_count, 2);
});

test('A11-B-807 의사 승률이 가장 높음 → highest_win_rate_role = 한글 직업 이름', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    await recordGame(user.uuid, user.nickname, 'DOCTOR', true);
    await recordGame(user.uuid, user.nickname, 'DOCTOR', true);
    await recordGame(user.uuid, user.nickname, 'CITIZEN', true);
    await recordGame(user.uuid, user.nickname, 'CITIZEN', false);
    const { data } = (await profile(app, session)).body;
    assert.notEqual(data.highest_win_rate_role, 'DOCTOR');
    assert.match(String(data.highest_win_rate_role), /^[가-힣]+$/);
    // 목록에 이름이 안 적혀 있어 의사 이름 둘(화면 표 '의사'·서버 표 '주치의') 중 하나면 맞음으로 봄
    assert.ok(['의사', '주치의'].includes(data.highest_win_rate_role), `의사 이름 아님: ${data.highest_win_rate_role}`);
});

test('A11-B-808 쿠키 없이 프로필 → 401', async (t) => {
    if (noDb(t)) return;
    const app = await h.startApp(t);
    const res = await app.get('/user/me/profile');
    assert.equal(res.status, 401);
});

// ── 닉네임 바꾸기 (809~818) ──

const RULE_TEXT = '닉네임은 2~8자여야 합니다.';
const CHANGED_TEXT = '닉네임이 변경되었습니다.';

// 겹치지 않는 n자 닉네임 (영문 소문자·숫자)
const freshNick = (n) => `n${h.tail()}${crypto.randomBytes(4).toString('hex')}`.slice(0, n);

test('A11-B-809 닉네임 2자 → 200 "닉네임이 변경되었습니다."', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const nick = freshNick(2);
    const res = await rename(app, session, nick);
    assert.equal(res.status, 200);
    assert.equal(res.body.message, CHANGED_TEXT);
    assert.equal((await h.userRow(user.uuid)).nickname, nick);
});

test('A11-B-810 닉네임 8자 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const nick = freshNick(8);
    const res = await rename(app, session, nick);
    assert.equal(res.status, 200);
    assert.equal((await h.userRow(user.uuid)).nickname, nick);
});

test('A11-B-811 닉네임 9자 → 400 규칙 문구', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await rename(app, session, freshNick(8).padEnd(9, 'z'));
    assert.equal(res.status, 400);
    assert.equal(res.body.message, RULE_TEXT);
    assert.equal((await h.userRow(user.uuid)).nickname, user.nickname);
});

test('A11-B-812 닉네임 가면! → 400', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await rename(app, session, '가면!');
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.');
    assert.equal((await h.userRow(user.uuid)).nickname, user.nickname);
});

test('A11-B-813 본문 없음 → 400 (500 아님)', async (t) => {
    if (noDb(t)) return;
    const { app, session } = await loggedIn(t);
    const res = await app.call('PATCH', '/user/me/nickname', { cookie: session.cookie });
    assert.equal(res.status, 400);
});

test('A11-B-814 금지어 든 닉네임 → 400 NICKNAME_BANNED_WORD', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    // 금지어 표에 한 줄 넣고 다시 읽음 (끝에 지우고 다시 읽음)
    const word = `금지${crypto.randomBytes(2).toString('hex')}`;
    const row = await db.BannedWord.create({ word, is_active: true });
    await bannedWords.reloadBannedWords();
    t.after(async () => {
        await db.BannedWord.destroy({ where: { id: row.id } });
        await bannedWords.reloadBannedWords();
    });
    const res = await rename(app, session, `${word}가`);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NICKNAME_BANNED_WORD');
    assert.equal((await h.userRow(user.uuid)).nickname, user.nickname);
});

test('A11-B-815 남이 쓰는 닉네임 → 409 "이미 사용 중인 닉네임입니다."', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const other = await h.createLocalUser({ prefix: 'mo' });
    const res = await rename(app, session, other.nickname);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 사용 중인 닉네임입니다.');
    assert.equal((await h.userRow(user.uuid)).nickname, user.nickname);
});

test('A11-B-816 지금 내 닉네임 그대로 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await rename(app, session, user.nickname);
    assert.equal(res.status, 200);
    assert.equal((await h.userRow(user.uuid)).nickname, user.nickname);
});

test('A11-B-817 " 가면 " → 200, DB 닉네임 "가면"', async (t) => {
    if (noDb(t)) return;
    const { app, user, session } = await loggedIn(t);
    const res = await rename(app, session, ' 가면 ');
    assert.equal(res.status, 200);
    assert.equal((await h.userRow(user.uuid)).nickname, '가면');
});

test('A11-B-818 A 탈퇴 → B가 A의 옛 닉네임으로 바꿈 → 200', async (t) => {
    if (noDb(t)) return;
    const { app, user: a, session: sa } = await loggedIn(t, { prefix: 'ma' });
    const b = await h.createLocalUser({ prefix: 'mb' });
    const sb = await h.sessionFor(b.uuid);
    assert.equal((await app.post('/user/me/withdraw', { password: a.password }, { cookie: sa.cookie })).status, 200, '준비: A 탈퇴');
    const res = await rename(app, sb, a.nickname);
    assert.equal(res.status, 200);
    assert.equal((await h.userRow(b.uuid)).nickname, a.nickname);
});
