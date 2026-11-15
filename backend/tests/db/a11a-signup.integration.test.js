'use strict';

// 이메일 가입 시험(시험 DB): 가입 답·계정 줄·비번 해시·증명 확인·동시 가입·중복·금지어·관리 칸 섞기·탈퇴 뒤 다시 가입
// 목록 A11-B-230~250 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 도우미·models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const h = require('./a11a-auth-db-helpers');
const bannedWords = require('../../services/ops/bannedWords');
const { listDefaultGrantItems } = require('../../services/economy/catalog');

const { db } = h;

let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    await h.prepareDb();
    app = await h.startApp();
});
test.after(async () => { await h.closeAll(app); });

// ── 이 파일 안 작은 도우미 ──
const signup = async (body, options = {}) => h.request(app.base, 'POST', '/auth/signup', { body, ...options });
const proof = (email) => h.proofOverHttp(app.base, email);
const usersWithEmail = (email) => db.User.count({ where: { email }, paranoid: false });
const usersWithNickname = (nickname) => db.User.count({ where: { nickname }, paranoid: false });
// 기본 지급 장부 줄 수 (아이템마다 한 줄)
const defaultGrantRows = async (uuid) => {
    const [rows] = await db.sequelize.query(
        "SELECT COUNT(*) AS n FROM economy_ledger_entries WHERE user_id = :uuid AND reason = 'DEFAULT_GRANT'",
        { replacements: { uuid } },
    );
    return Number(rows[0].n);
};
const PROOF_INVALID = 'SIGNUP_PROOF_INVALID';

test('A11-B-230 인증 → 가입 → 200 완료 답', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b230');
    const res = await signup(await h.signupBody({ email, signupProof: await proof(email), nickname: h.nicknameOf('b230') }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, message: '회원가입이 완료되었습니다.' });
});

test('A11-B-231 가입한 계정 줄 1개·통계 줄·기본 지급 줄', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b231');
    const nickname = h.nicknameOf('b231');
    const res = await signup(await h.signupBody({ email, signupProof: await proof(email), nickname, birthDate: '2001-03-04' }));
    assert.equal(res.status, 200);
    const rows = await db.User.findAll({ where: { email }, raw: true });
    assert.equal(rows.length, 1);
    const [user] = rows;
    assert.equal(user.nickname, nickname);
    assert.equal(new Date(user.birth_date).toISOString().slice(0, 10), '2001-03-04');
    assert.equal(Boolean(user.email_verified), true);
    assert.equal(Boolean(user.has_local_password), true);
    assert.equal(await db.UserStats.count({ where: { user_id: user.uuid } }), 1);
    assert.equal(await defaultGrantRows(user.uuid), listDefaultGrantItems().length);
    assert.ok(listDefaultGrantItems().length > 0);
});

test('A11-B-232 비번은 bcrypt 해시만, 원문은 어느 칸에도 없음', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b232');
    const password = 'b232-secret-pw';
    await signup(await h.signupBody({ email, signupProof: await proof(email), nickname: h.nicknameOf('b232'), password }));
    const user = await db.User.findOne({ where: { email }, raw: true });
    assert.match(user.password_hash, /^\$2[aby]\$\d{2}\$/);
    assert.equal(await bcrypt.compare(password, user.password_hash), true);
    for (const [column, value] of Object.entries(user)) {
        assert.ok(!String(value ?? '').includes(password), `${column} 칸에 비번 원문이 있음`);
    }
});

test('A11-B-233 가입한 비번으로 바로 로그인 → 200', async (t) => {
    if (h.noDb(t)) return;
    const account = await h.signupOverHttp(app.base, { label: 'b233', password: 'b233-pass-1' });
    const { res } = await h.loginOverHttp(app.base, { email: account.email, password: 'b233-pass-1' });
    assert.equal(res.status, 200);
});

test('A11-B-234 증명 없이 가입 → 401 SIGNUP_PROOF_REQUIRED, 계정 0줄', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b234');
    const res = await signup(await h.signupBody({ email, signupProof: undefined, nickname: h.nicknameOf('b234') }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'SIGNUP_PROOF_REQUIRED');
    assert.equal(res.body.message, '이메일 인증이 필요합니다.');
    assert.equal(await usersWithEmail(email), 0);
});

// 못 쓰는 증명 다섯 가지 → 401 SIGNUP_PROOF_INVALID, 새 계정 없음
test('A11-B-235 아무 글자 증명 → 401 SIGNUP_PROOF_INVALID, 계정 0줄', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b235');
    await proof(email);
    const res = await signup(await h.signupBody({ email, signupProof: 'not-a-real-proof', nickname: h.nicknameOf('b235') }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, PROOF_INVALID);
    assert.equal(await usersWithEmail(email), 0);
});

test('A11-B-236 다른 주소의 증명 → 401 SIGNUP_PROOF_INVALID, 계정 0줄', async (t) => {
    if (h.noDb(t)) return;
    const other = h.emailOf('b236o');
    const email = h.emailOf('b236');
    const otherProof = await proof(other);
    const res = await signup(await h.signupBody({ email, signupProof: otherProof, nickname: h.nicknameOf('b236') }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, PROOF_INVALID);
    assert.equal(await usersWithEmail(email), 0);
});

test('A11-B-237 10분 지난 증명(끝 시각 칸 앞당김) → 401 SIGNUP_PROOF_INVALID, 계정 0줄', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b237');
    const signupProof = await proof(email);
    await db.SignupEmailVerification.update(
        { proof_expires_at: new Date(Date.now() - 60_000) },
        { where: { email, purpose: 'SIGNUP' } },
    );
    const res = await signup(await h.signupBody({ email, signupProof, nickname: h.nicknameOf('b237') }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, PROOF_INVALID);
    assert.equal(await usersWithEmail(email), 0);
});

test('A11-B-238 이미 쓴 증명 → 401 SIGNUP_PROOF_INVALID, 새 계정 없음', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b238');
    const signupProof = await proof(email);
    assert.equal((await signup(await h.signupBody({ email, signupProof, nickname: h.nicknameOf('b238') }))).status, 200);
    const secondNickname = h.nicknameOf('b238');
    const res = await signup(await h.signupBody({ email, signupProof, nickname: secondNickname }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, PROOF_INVALID);
    assert.equal(await usersWithNickname(secondNickname), 0);
});

test('A11-B-239 비번 재설정 토큰을 증명으로 → 401 SIGNUP_PROOF_INVALID, 계정 0줄', async (t) => {
    if (h.noDb(t)) return;
    h.withEnv(t, { PASSWORD_RESET_APP_URL: 'https://play.a11a.test' });
    const owner = await h.createUser({ label: 'b239o' });
    const passwordReset = require('../../services/auth/passwordReset');
    await passwordReset.requestPasswordReset({ email: owner.email }, { mailAdapter: h.mailbox });
    const resetUrl = h.mailsTo(owner.email).at(-1)?.params.resetUrl;
    const resetToken = new URL(resetUrl).searchParams.get('token');
    assert.ok(resetToken, '준비: 재설정 토큰 못 받음');
    const email = h.emailOf('b239');
    await proof(email);
    const res = await signup(await h.signupBody({ email, signupProof: resetToken, nickname: h.nicknameOf('b239') }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, PROOF_INVALID);
    assert.equal(await usersWithEmail(email), 0);
});

test('A11-B-240 증명 받은 뒤 인증번호 다시 받기 → 옛 증명으로 가입 401', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b240');
    const oldProof = await proof(email);
    // 다시 보내기 60초 대기 지난 것으로 (보낸 시각 칸 61초 앞당김)
    await db.SignupEmailVerification.update(
        { sent_at: new Date(Math.floor(Date.now() / 1000) * 1000 - 61_000) },
        { where: { email, purpose: 'SIGNUP' } },
    );
    const again = await h.request(app.base, 'POST', '/auth/signup/email-code', { body: { email } });
    assert.equal(again.status, 200, '준비: 다시 받기 실패');
    const res = await signup(await h.signupBody({ email, signupProof: oldProof, nickname: h.nicknameOf('b240') }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, PROOF_INVALID);
});

test('A11-B-241 같은 증명 동시 가입 둘 → 200 하나·401 하나, 계정 1줄, 기본 지급 한 벌', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b241');
    const signupProof = await proof(email);
    const bodies = await Promise.all([1, 2].map(async () => h.signupBody({ email, signupProof, nickname: h.nicknameOf('b241') })));
    const results = await Promise.all(bodies.map((body) => signup(body)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
    const users = await db.User.findAll({ where: { email }, raw: true });
    assert.equal(users.length, 1);
    assert.equal(await defaultGrantRows(users[0].uuid), listDefaultGrantItems().length);
});

test('A11-B-242 다른 주소·같은 닉네임 동시 가입 → 200 하나·409 하나', async (t) => {
    if (h.noDb(t)) return;
    const nickname = h.nicknameOf('b242');
    const emails = [h.emailOf('b242a'), h.emailOf('b242b')];
    const proofs = [await proof(emails[0]), await proof(emails[1])];
    const bodies = await Promise.all(emails.map((email, i) => h.signupBody({ email, signupProof: proofs[i], nickname })));
    const results = await Promise.all(bodies.map((body) => signup(body)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(await usersWithNickname(nickname), 1);
});

test('A11-B-243 증명 받은 뒤 같은 이메일 계정이 생김 → 409 이메일 중복', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b243');
    const signupProof = await proof(email);
    await h.createUser({ label: 'b243x', email });
    const res = await signup(await h.signupBody({ email, signupProof, nickname: h.nicknameOf('b243') }));
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 사용 중인 이메일입니다.');
});

test('A11-B-244 있는 닉네임 → 409 닉네임 중복', async (t) => {
    if (h.noDb(t)) return;
    const taken = await h.createUser({ label: 'b244x' });
    const email = h.emailOf('b244');
    const res = await signup(await h.signupBody({ email, signupProof: await proof(email), nickname: taken.nickname }));
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 사용 중인 닉네임입니다.');
});

// 증명 소비·계정 만들기가 한 덩어리라 거절되면 증명도 안 쓴 것
test('A11-B-245 닉네임 겹침 409 뒤 닉네임만 바꿔 같은 증명 → 200', async (t) => {
    if (h.noDb(t)) return;
    const taken = await h.createUser({ label: 'b245x' });
    const email = h.emailOf('b245');
    const signupProof = await proof(email);
    const first = await signup(await h.signupBody({ email, signupProof, nickname: taken.nickname }));
    assert.equal(first.status, 409);
    const second = await signup(await h.signupBody({ email, signupProof, nickname: h.nicknameOf('b245') }));
    assert.equal(second.status, 200);
});

// 금지어 표: 시험 줄만 넣고 끝나면 지우고 다시 읽음
async function useBannedWords(t, words) {
    const rows = await Promise.all(words.map((word) => db.BannedWord.create({ word, is_active: true })));
    await bannedWords.reloadBannedWords({ db });
    t.after(async () => {
        await db.BannedWord.destroy({ where: { id: rows.map((row) => row.id) } });
        await bannedWords.reloadBannedWords({ db });
    });
}

test('A11-B-246 금지어 표에 "나쁜말" → "나쁜말99" 가입 400 NICKNAME_BANNED_WORD', async (t) => {
    if (h.noDb(t)) return;
    await useBannedWords(t, ['나쁜말']);
    const email = h.emailOf('b246');
    const res = await signup(await h.signupBody({ email, signupProof: await proof(email), nickname: '나쁜말99' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NICKNAME_BANNED_WORD');
    assert.equal(await usersWithEmail(email), 0);
});

test('A11-B-247 금지어 표 빔 → "나쁜말99" 가입 200', async (t) => {
    if (h.noDb(t)) return;
    await useBannedWords(t, []);
    assert.equal(bannedWords.getBannedWordCount(), 0, '준비: 금지어 표가 비지 않음');
    const email = h.emailOf('b247');
    const res = await signup(await h.signupBody({ email, signupProof: await proof(email), nickname: '나쁜말99' }));
    assert.equal(res.status, 200);
});

test('A11-B-248 관리 칸을 섞어 보내도 안 들어감', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b248');
    const body = await h.signupBody({
        email, signupProof: await proof(email), nickname: h.nicknameOf('b248'),
        role: 'ADMIN', status: 'BANNED', email_verified: false, has_local_password: false, gold: 99999,
    });
    assert.equal((await signup(body)).status, 200);
    const user = await db.User.findOne({ where: { email }, raw: true });
    assert.equal(user.role, 'USER');
    assert.equal(user.status, 'ACTIVE');
    assert.equal(Boolean(user.email_verified), true);
    assert.equal(Boolean(user.has_local_password), true);
    // 지갑 기본 값 = 골드·다이아 0 (줄 없어도 기본)
    const [wallets] = await db.sequelize.query(
        'SELECT balance_gold, balance_diamond FROM economy_wallets WHERE user_id = :uuid', { replacements: { uuid: user.uuid } },
    );
    for (const wallet of wallets) {
        assert.equal(Number(wallet.balance_gold), 0);
        assert.equal(Number(wallet.balance_diamond), 0);
    }
});

test('A11-B-249 서버도 같은 비번 규칙: 7자 → 400 문구, 0줄 → 같은 증명으로 고쳐 200', async (t) => {
    if (h.noDb(t)) return;
    const email = h.emailOf('b249');
    const signupProof = await proof(email);
    const nickname = h.nicknameOf('b249');
    const short = await signup(await h.signupBody({ email, signupProof, nickname, password: 'abcdefg' }));
    assert.equal(short.status, 400);
    assert.equal(short.body.message, '비밀번호는 8~64자여야 합니다.');
    assert.equal(await usersWithEmail(email), 0);
    const fixed = await signup(await h.signupBody({ email, signupProof, nickname, password: 'abcdefgh' }));
    assert.equal(fixed.status, 200);
});

test('A11-B-250 탈퇴한 사람 이메일·닉네임으로 다시 가입 → 200', async (t) => {
    if (h.noDb(t)) return;
    const old = await h.signupOverHttp(app.base, { label: 'b250' });
    const { withdrawAccount } = require('../../services/auth/account/withdraw');
    await withdrawAccount({ uuid: old.uuid, password: old.password });
    const res = await signup(await h.signupBody({ email: old.email, signupProof: await proof(old.email), nickname: old.nickname }));
    assert.equal(res.status, 200);
});
