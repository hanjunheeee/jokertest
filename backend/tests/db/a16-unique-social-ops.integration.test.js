'use strict';

// 친구·초대·알림·접속·신고·금지어·쿠폰·관리자·문의 표의 "겹치면 안 되는 것"이 DB에서 막히는지, 일부러 겹쳐도 되는 것은 들어가는지 봄 (SQL로 직접 넣음)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-226~241·243·244 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
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

const now = () => new Date();
const later = () => new Date(Date.now() + 60 * 60_000);

// 시험마다 새 두 사람 (민수·지유)
async function pair() {
    return { minsu: await h.createUser('민수'), jiyu: await h.createUser('지유') };
}

const friendRequest = (from, to, status) => ({ requester_id: from, receiver_id: to, status, created_at: now() });
const inviteRow = (senderId, receiverId, extra = {}) => ({
    id: crypto.randomUUID(), sender_id: senderId, receiver_id: receiverId, room_id: 'ROOM01', room_instance_id: crypto.randomUUID(),
    boot_epoch: 'boot-a16', creation_key: `key-${crypto.randomUUID()}`, created_at: now(), expires_at: later(), ...extra,
});
const reportRow = (reporterId, targetId, gameId) => ({ reporter_id: reporterId, target_id: targetId, game_id: gameId, reason_code: 'ABUSE', created_at: now() });
const couponRow = (code) => ({ code, reward_type: 'GOLD', reward_amount: 10, created_at: now(), updated_at: now() });

test('A16-B-226 같은 두 사람 같은 방향 기다리는 친구 신청은 하나', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    await h.insert('friend_requests', friendRequest(minsu, jiyu, 'PENDING'));
    await h.expectDuplicate(h.insert('friend_requests', friendRequest(minsu, jiyu, 'PENDING')), 'friend_requests_pending_pair_unique');
    assert.equal(await h.count('friend_requests', 'requester_id = :minsu', { minsu }), 1);
});

test('A16-B-227 반대 방향 기다리는 신청도 같은 목차가 막음', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    await h.insert('friend_requests', friendRequest(minsu, jiyu, 'PENDING'));
    await h.expectDuplicate(h.insert('friend_requests', friendRequest(jiyu, minsu, 'PENDING')), 'friend_requests_pending_pair_unique');
    assert.equal(await h.count('friend_requests', 'requester_id IN (:minsu, :jiyu)', { minsu, jiyu }), 1);
});

test('A16-B-228 같은 두 사람 친구 줄 하나', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const row = { requester_id: minsu, receiver_id: jiyu, created_at: now(), updated_at: now() };
    await h.insert('friendships', row);
    await h.expectDuplicate(h.insert('friendships', row), 'friendships_requester_receiver');
    assert.equal(await h.count('friendships', 'requester_id = :minsu', { minsu }), 1);
});

test('A16-B-229 같은 사람 두 번 차단 안 됨', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const row = { owner_id: minsu, blocked_id: jiyu, created_at: now() };
    await h.insert('friend_blocks', row);
    await h.expectDuplicate(h.insert('friend_blocks', row), 'friend_blocks_owner_blocked_unique');
    assert.equal(await h.count('friend_blocks', 'owner_id = :minsu', { minsu }), 1);
});

test('A16-B-230 같은 친구 즐겨찾기 두 번 안 됨', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const row = { owner_id: minsu, friend_id: jiyu, created_at: now() };
    await h.insert('friend_favorites', row);
    await h.expectDuplicate(h.insert('friend_favorites', row), 'friend_favorites_owner_friend_unique');
    assert.equal(await h.count('friend_favorites', 'owner_id = :minsu', { minsu }), 1);
});

test('A16-B-231 초대 순번은 겹치지 않음 (다른 초대 둘에 같은 순번 거절)', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const seq = 900_000 + Math.floor(Math.random() * 90_000);
    await h.insert('game_invites', inviteRow(minsu, jiyu, { creation_seq: seq }));
    await h.expectDuplicate(h.insert('game_invites', inviteRow(minsu, jiyu, { creation_seq: seq })), 'game_invites_creation_seq_unique');
    assert.equal(await h.count('game_invites', 'creation_seq = :seq', { seq }), 1);
});

test('A16-B-232 같은 초대 요청이 두 번 와도 초대 하나 (보낸 사람 + 요청 키)', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const creationKey = `key-${crypto.randomUUID()}`;
    await h.insert('game_invites', inviteRow(minsu, jiyu, { creation_key: creationKey }));
    await h.expectDuplicate(h.insert('game_invites', inviteRow(minsu, jiyu, { creation_key: creationKey })), 'game_invites_sender_key_unique');
    assert.equal(await h.count('game_invites', 'sender_id = :minsu', { minsu }), 1);
});

test('A16-B-233 같은 일로 알림 두 번 안 됨 (다른 사람·같은 키는 들어감)', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const sourceKey = `friend:${crypto.randomUUID()}`;
    const row = (userId) => ({ id: crypto.randomUUID(), user_id: userId, type: 'FRIEND', source_key: sourceKey, title: '알림', body: '알림', created_at: now() });
    await h.insert('notifications', row(minsu));
    await h.expectDuplicate(h.insert('notifications', row(minsu)), 'notifications_user_source_unique');
    await h.insert('notifications', row(jiyu));
    assert.equal(await h.count('notifications', 'source_key = :sourceKey', { sourceKey }), 2);
});

test('A16-B-234 접속 상태는 한 사람 한 줄 (기본 키 겹침)', async (t) => {
    if (noDb(t)) return;
    const { minsu } = await pair();
    await h.insert('online_presence', { user_id: minsu });
    await h.expectDuplicate(h.insert('online_presence', { user_id: minsu }), 'PRIMARY');
    assert.equal(await h.count('online_presence', 'user_id = :minsu', { minsu }), 1);
});

test('A16-B-235 같은 판·같은 대상 신고는 한 번 (다른 판은 들어감)', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    const gameId = crypto.randomUUID();
    await h.insert('reports', reportRow(minsu, jiyu, gameId));
    await h.expectDuplicate(h.insert('reports', reportRow(minsu, jiyu, gameId)), 'reports_reporter_target_game_unique');
    await h.insert('reports', reportRow(minsu, jiyu, crypto.randomUUID()));
    assert.equal(await h.count('reports', 'reporter_id = :minsu', { minsu }), 2);
});

test('A16-B-236 같은 금지어 두 줄 안 됨', async (t) => {
    if (noDb(t)) return;
    const word = `금지${crypto.randomUUID().slice(0, 6)}`;
    const row = { word, created_at: now(), updated_at: now() };
    await h.insert('banned_words', row);
    await h.expectDuplicate(h.insert('banned_words', row), 'banned_words_word_unique');
    assert.equal(await h.count('banned_words', 'word = :word', { word }), 1);
});

test('A16-B-237 같은 쿠폰 코드 두 개 안 됨', async (t) => {
    if (noDb(t)) return;
    const code = `A16${crypto.randomUUID().slice(0, 8)}`;
    await h.insert('coupons', couponRow(code));
    await h.expectDuplicate(h.insert('coupons', couponRow(code)), 'coupons_code_unique');
    assert.equal(await h.count('coupons', 'code = :code', { code }), 1);
});

test('A16-B-238 한 사람 한 쿠폰 한 번', async (t) => {
    if (noDb(t)) return;
    const { minsu } = await pair();
    const couponId = await h.insert('coupons', couponRow(`A16${crypto.randomUUID().slice(0, 8)}`));
    const row = () => ({ id: crypto.randomUUID(), coupon_id: couponId, user_id: minsu, redeemed_at: now() });
    await h.insert('coupon_redemptions', row());
    await h.expectDuplicate(h.insert('coupon_redemptions', row()), 'coupon_redemptions_coupon_user_unique');
    assert.equal(await h.count('coupon_redemptions', 'coupon_id = :couponId', { couponId }), 1);
});

test('A16-B-239 관리자 로그인 아이디는 하나', async (t) => {
    if (noDb(t)) return;
    const loginId = `adm${crypto.randomUUID().slice(0, 8)}`;
    const row = () => ({ id: crypto.randomUUID(), login_id: loginId, password_hash: 'not-a-real-hash', created_at: now(), updated_at: now() });
    await h.insert('admin_users', row());
    await h.expectDuplicate(h.insert('admin_users', row()), 'admin_users_login_id_unique');
    assert.equal(await h.count('admin_users', 'login_id = :loginId', { loginId }), 1);
});

test('A16-B-240 관리자 메일은 한 사람만 (다른 아이디 둘에 같은 메일 거절)', async (t) => {
    if (noDb(t)) return;
    const email = `admin-${crypto.randomUUID()}@example.test`;
    await h.createAdmin('ma', { email });
    await h.expectDuplicate(h.createAdmin('mb', { email }), 'admin_users_email_unique');
    assert.equal(await h.count('admin_users', 'email = :email', { email }), 1);
});

test('A16-B-241 문의 답 요청 번호는 표 전체에서 하나 (문의 둘에 같은 번호 거절)', async (t) => {
    if (noDb(t)) return;
    const { minsu } = await pair();
    const adminId = await h.createAdmin('rp');
    const inquiry = () => h.insert('inquiries', { user_id: minsu, category: 'GAME', title: '문의', body: '문의', created_at: now(), updated_at: now() });
    const first = await inquiry();
    const second = await inquiry();
    const requestId = `req-${crypto.randomUUID()}`;
    const reply = (inquiryId) => ({ inquiry_id: inquiryId, admin_id: adminId, body: '답', request_id: requestId, created_at: now() });
    await h.insert('inquiry_replies', reply(first));
    await h.expectDuplicate(h.insert('inquiry_replies', reply(second)), 'inquiry_replies_request_id_unique');
    assert.equal(await h.count('inquiry_replies', 'request_id = :requestId', { requestId }), 1);
});

test('A16-B-243 끝난 친구 신청은 같은 짝 여러 줄 됨, 짝 키는 PENDING 줄만', async (t) => {
    if (noDb(t)) return;
    const { minsu, jiyu } = await pair();
    for (const status of ['DECLINED', 'DECLINED', 'CANCELLED', 'PENDING']) {
        await h.insert('friend_requests', friendRequest(minsu, jiyu, status));
    }
    const rows = await h.select('SELECT status, pending_pair_key FROM friend_requests WHERE requester_id = :minsu ORDER BY id', { minsu });
    assert.equal(rows.length, 4);
    // 작은 uuid : 큰 uuid
    const [small, big] = [minsu, jiyu].sort();
    assert.deepEqual(rows.map((row) => row.pending_pair_key), [null, null, null, `${small}:${big}`]);
});

test('A16-B-244 관리자 메일이 빈 줄은 여러 개 됨', async (t) => {
    if (noDb(t)) return;
    const first = await h.createAdmin('na', { email: null });
    const second = await h.createAdmin('nb', { email: null });
    assert.equal(await h.count('admin_users', 'id IN (:first, :second) AND email IS NULL', { first, second }), 2);
});
