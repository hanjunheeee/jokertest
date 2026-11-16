'use strict';

// 계정·로그인·약관·이력 표의 "겹치면 안 되는 것"이 DB에서 진짜로 막히는지, 일부러 안 막은 것은 들어가는지 봄 (SQL로 직접 넣음)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-201~212·246 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb } = h;

test.before(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
});

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const hash = () => crypto.randomBytes(32).toString('hex');
const later = () => new Date(Date.now() + 60 * 60_000);

// 회원 줄 (메일·닉네임 직접 줌)
const userRow = (email, nickname) => ({
    uuid: crypto.randomUUID(), password_hash: 'not-a-real-hash', nickname, email, created_at: new Date(), updated_at: new Date(),
});

// 로그인 세션 줄
async function createSession(userId, extra = {}) {
    const id = `sess-${crypto.randomUUID()}`;
    await h.insert('user_sessions', { id, user_id: userId, ...extra });
    return id;
}

test('A16-B-201 같은 메일로 두 계정 안 됨', async (t) => {
    if (noDb(t)) return;
    const email = `same-${crypto.randomUUID()}@example.test`;
    await h.insert('users', userRow(email, `민수${crypto.randomUUID().slice(0, 6)}`));
    await h.expectDuplicate(h.insert('users', userRow(email, `지유${crypto.randomUUID().slice(0, 6)}`)));
    assert.equal(await h.count('users', 'email = :email', { email }), 1);
});

test('A16-B-202 같은 닉네임 두 계정 안 됨', async (t) => {
    if (noDb(t)) return;
    const nickname = `민수${crypto.randomUUID().slice(0, 6)}`;
    await h.insert('users', userRow(`a-${crypto.randomUUID()}@example.test`, nickname));
    await h.expectDuplicate(h.insert('users', userRow(`b-${crypto.randomUUID()}@example.test`, nickname)));
    assert.equal(await h.count('users', 'nickname = :nickname', { nickname }), 1);
});

test('A16-B-203 옛 로그인 유지 토큰 해시는 하나만 (세션 둘에 같은 해시 → 거절)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ua');
    const sessionA = await createSession(userId);
    const sessionB = await createSession(userId);
    const tokenHash = hash();
    await h.insert('refresh_token_history', { session_id: sessionA, token_hash: tokenHash, created_at: new Date() });
    await h.expectDuplicate(h.insert('refresh_token_history', { session_id: sessionB, token_hash: tokenHash, created_at: new Date() }), 'refresh_token_history_token_hash_unique');
    assert.equal(await h.count('refresh_token_history', 'token_hash = :tokenHash', { tokenHash }), 1);
});

test('A16-B-204 같은 약관 버전에 같은 사람 동의는 한 줄', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ua');
    const [terms] = await h.select("SELECT id FROM terms_versions WHERE kind = 'TERMS' LIMIT 1");
    const row = { user_id: userId, terms_version_id: terms.id, agreed_at: new Date() };
    await h.insert('user_terms_agreements', row);
    await h.expectDuplicate(h.insert('user_terms_agreements', row), 'user_terms_agreements_user_version_unique');
    assert.equal(await h.count('user_terms_agreements', 'user_id = :userId', { userId }), 1);
});

test('A16-B-205 같은 종류·같은 버전 약관은 하나 (TERMS 1.0 두 번 거절, PRIVACY 1.0은 들어감)', async (t) => {
    if (noDb(t)) return;
    const termsRow = (kind) => ({ kind, version: '1.0', title: '약관', effective_at: new Date(), created_at: new Date() });
    await h.insert('terms_versions', termsRow('TERMS'));
    await h.expectDuplicate(h.insert('terms_versions', termsRow('TERMS')), 'terms_versions_kind_version_unique');
    await h.insert('terms_versions', termsRow('PRIVACY'));
    assert.equal(await h.count('terms_versions', "version = '1.0'"), 2);
});

test('A16-B-206 마이그레이션 이력은 이름마다 한 줄 (0034 줄 하나 더 → 거절)', async (t) => {
    if (noDb(t)) return;
    await h.expectDuplicate(h.insert('schema_migrations', {
        name: '0034-add-game-settings', checksum: '0'.repeat(64), status: 'applied', started_at: new Date(),
    }));
    assert.equal(await h.count('schema_migrations', "name = '0034-add-game-settings'"), 1);
});

test('A16-B-207 소셜 계정 하나는 한 회원에만', async (t) => {
    if (noDb(t)) return;
    const minsu = await h.createUser('민수');
    const jiyu = await h.createUser('지유');
    const subject = `sub-${crypto.randomUUID()}`;
    const row = (userId) => ({ provider: 'discord', subject, user_id: userId, created_at: new Date(), updated_at: new Date() });
    await h.insert('external_identities', row(minsu));
    await h.expectDuplicate(h.insert('external_identities', row(jiyu)), 'external_identities_provider_subject_unique');
    assert.equal(await h.count('external_identities', 'subject = :subject', { subject }), 1);
});

test('A16-B-208 소셜 로그인 확인표는 한 번 왕복에 하나 (같은 state 해시 거절)', async (t) => {
    if (noDb(t)) return;
    const stateHash = hash();
    const row = () => ({ state_hash: stateHash, purpose: 'LOGIN', browser_fingerprint_hash: hash(), expires_at: later(), created_at: new Date() });
    await h.insert('oauth_states', row());
    await h.expectDuplicate(h.insert('oauth_states', row()), 'oauth_states_state_hash_unique');
    assert.equal(await h.count('oauth_states', 'state_hash = :stateHash', { stateHash }), 1);
});

test('A16-B-209 소셜 가입 대기표로 가입은 한 번 (같은 대기표 해시 거절)', async (t) => {
    if (noDb(t)) return;
    const tokenHash = hash();
    const row = () => ({ intent_token_hash: tokenHash, provider: 'discord', subject: `sub-${crypto.randomUUID()}`, expires_at: later(), created_at: new Date() });
    await h.insert('social_signup_intents', row());
    await h.expectDuplicate(h.insert('social_signup_intents', row()), 'social_signup_intents_token_hash_unique');
    assert.equal(await h.count('social_signup_intents', 'intent_token_hash = :tokenHash', { tokenHash }), 1);
});

test('A16-B-210 메일 인증 확인표는 주소·목적마다 한 줄 (같은 묶음 거절, 다른 목적은 들어감)', async (t) => {
    if (noDb(t)) return;
    const email = `v-${crypto.randomUUID()}@example.test`;
    await h.insert('signup_email_verifications', { email, purpose: 'SIGNUP' });
    await h.expectDuplicate(h.insert('signup_email_verifications', { email, purpose: 'SIGNUP' }), 'signup_email_verifications_email_purpose_unique');
    await h.insert('signup_email_verifications', { email, purpose: 'EMAIL_CHANGE' });
    assert.equal(await h.count('signup_email_verifications', 'email = :email', { email }), 2);
});

test('A16-B-211 가입 증명은 한 번만 (다른 메일 둘에 같은 증명 해시 거절)', async (t) => {
    if (noDb(t)) return;
    const proofHash = hash();
    await h.insert('signup_email_verifications', { email: `p1-${crypto.randomUUID()}@example.test`, purpose: 'SIGNUP', proof_hash: proofHash });
    await h.expectDuplicate(
        h.insert('signup_email_verifications', { email: `p2-${crypto.randomUUID()}@example.test`, purpose: 'SIGNUP', proof_hash: proofHash }),
        'signup_email_verifications_proof_hash_unique',
    );
    assert.equal(await h.count('signup_email_verifications', 'proof_hash = :proofHash', { proofHash }), 1);
});

test('A16-B-212 비번 재설정 링크 하나는 한 줄 (같은 토큰 해시 거절)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ua');
    const tokenHash = hash();
    const row = () => ({ user_id: userId, expired_at: later(), token_hash: tokenHash });
    await h.insert('password_reset_tokens', row());
    await h.expectDuplicate(h.insert('password_reset_tokens', row()), 'password_reset_tokens_token_hash_unique');
    assert.equal(await h.count('password_reset_tokens', 'token_hash = :tokenHash', { tokenHash }), 1);
});

test('A16-B-246 세션 갱신 해시는 일부러 유일 아님 (세션 둘에 같은 해시 들어감, 목차 둘은 있음)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('ua');
    const refreshHash = hash();
    await createSession(userId, { refresh_token_hash: refreshHash });
    await createSession(userId, { refresh_token_hash: refreshHash });
    assert.equal(await h.count('user_sessions', 'refresh_token_hash = :refreshHash', { refreshHash }), 2);

    const indexes = await h.qi().showIndex('user_sessions');
    for (const name of ['user_sessions_refresh_token_hash', 'user_sessions_refresh_previous_hash']) {
        const found = indexes.find((index) => index.name === name);
        assert.ok(found, `${name} 없음`);
        assert.equal(found.unique === true, false, `${name}이 유일`);
    }
});
