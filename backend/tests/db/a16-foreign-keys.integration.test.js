'use strict';

// 외래키(다른 표와 잇는 칸)가 문서에 "걸림"이라 한 곳에만 있고, "안 걸림"이라 한 칸은 없는 값도 받는지, 같이 지워지는 곳은 같이 지워지는지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-251~257 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
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
const U = 'users.uuid';

// 목록 부록 2: 외래키 43개 (표.칸 → 부모 표.칸)
const EXPECTED_FOREIGN_KEYS = [
    ['login_history.user_id', U], ['user_sessions.user_id', U], ['refresh_token_history.session_id', 'user_sessions.id'],
    ['user_bans.user_id', U], ['user_terms_agreements.user_id', U], ['user_terms_agreements.terms_version_id', 'terms_versions.id'],
    ['external_identities.user_id', U], ['oauth_states.user_id', U], ['password_reset_tokens.user_id', U],
    ['game_result_players.game_id', 'game_results.id'], ['vote_participations.user_id', U], ['user_stats.user_id', U],
    ['achievement_grants.user_id', U],
    ['economy_wallets.user_id', U], ['economy_ledger_entries.user_id', U], ['economy_purchase_requests.user_id', U],
    ['economy_entitlements.user_id', U], ['economy_loadouts.user_id', U], ['economy_emoji_palettes.user_id', U],
    ['economy_topup_orders.user_id', U],
    ['friend_requests.requester_id', U], ['friend_requests.receiver_id', U], ['friendships.requester_id', U], ['friendships.receiver_id', U],
    ['friend_blocks.owner_id', U], ['friend_blocks.blocked_id', U], ['friend_favorites.owner_id', U], ['friend_favorites.friend_id', U],
    ['game_invites.sender_id', U], ['game_invites.receiver_id', U], ['notifications.user_id', U], ['online_presence.user_id', U],
    ['reports.reporter_id', U], ['reports.target_id', U], ['report_chat_evidence.report_id', 'reports.id'],
    ['coupon_redemptions.coupon_id', 'coupons.id'], ['coupon_redemptions.user_id', U],
    ['admin_sessions.admin_id', 'admin_users.id'], ['admin_audit_logs.admin_id', 'admin_users.id'],
    ['inquiries.user_id', U], ['inquiry_replies.inquiry_id', 'inquiries.id'], ['inquiry_replies.admin_id', 'admin_users.id'],
    ['game_desertions.user_id', U],
].map(([from, to]) => `${from} -> ${to}`).sort();

test('A16-B-251 외래키 전체 목록이 문서(부록 2, 43개)와 같음, oauth_states.user_id 이름은 oauth_states_ibfk_1', async (t) => {
    if (noDb(t)) return;
    assert.equal(EXPECTED_FOREIGN_KEYS.length, 43);
    const rows = await h.select(
        'SELECT TABLE_NAME AS t, COLUMN_NAME AS c, REFERENCED_TABLE_NAME AS rt, REFERENCED_COLUMN_NAME AS rc, CONSTRAINT_NAME AS name '
        + 'FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL',
    );
    const actual = rows.map((row) => `${row.t}.${row.c} -> ${row.rt}.${row.rc}`).sort();
    assert.deepEqual(actual, EXPECTED_FOREIGN_KEYS);
    const oauth = rows.find((row) => row.t === 'oauth_states' && row.c === 'user_id');
    assert.equal(oauth?.name, 'oauth_states_ibfk_1');
});

// 문서가 "안 걸림"이라 한 칸은 부모 줄 없이도 들어감 (값 4 = 시험 4개)
const UNLINKED_CASES = [
    ['A16-B-252', 'vote_participations.game_id = 없는 판', async () => {
        const userId = await h.createUser('fk');
        const gameId = crypto.randomUUID();
        await h.insert('vote_participations', { game_id: gameId, day_index: 1, user_id: userId, accepted_at: now() });
        return h.count('vote_participations', 'game_id = :gameId', { gameId });
    }],
    ['A16-B-253', 'reports.game_id = 없는 판 + handled_by_admin_id = 없는 관리자', async () => {
        const reporter = await h.createUser('fk');
        const target = await h.createUser('fk');
        const gameId = crypto.randomUUID();
        await h.insert('reports', {
            reporter_id: reporter, target_id: target, game_id: gameId, reason_code: 'ABUSE', handled_by_admin_id: crypto.randomUUID(), created_at: now(),
        });
        return h.count('reports', 'game_id = :gameId', { gameId });
    }],
    ['A16-B-254', 'oauth_states.session_id = 없는 세션', async () => {
        const stateHash = crypto.randomBytes(32).toString('hex');
        await h.insert('oauth_states', {
            state_hash: stateHash, purpose: 'LINK', session_id: `sess-${crypto.randomUUID()}`,
            browser_fingerprint_hash: crypto.randomBytes(32).toString('hex'), expires_at: later(), created_at: now(),
        });
        return h.count('oauth_states', 'state_hash = :stateHash', { stateHash });
    }],
    ['A16-B-255', 'economy_topup_orders.product_id = 없는 상품', async () => {
        const userId = await h.createUser('fk');
        const orderId = `ord-${crypto.randomUUID()}`;
        await h.insert('economy_topup_orders', {
            order_id: orderId, user_id: userId, product_id: 'no-such-product', version: 1, pay_amount: 1000,
            grant_amount: 10, order_name: '다이아 10', created_at: now(), updated_at: now(),
        });
        return h.count('economy_topup_orders', 'order_id = :orderId', { orderId });
    }],
];
for (const [id, label, run] of UNLINKED_CASES) {
    test(`${id} 안 걸린 칸은 없는 값도 받음: ${label}`, async (t) => {
        if (noDb(t)) return;
        assert.equal(await run(), 1);
    });
}

test('A16-B-256 신고를 지우면 채팅 증거도 같이 지워짐', async (t) => {
    if (noDb(t)) return;
    const reporter = await h.createUser('fk');
    const target = await h.createUser('fk');
    const reportId = await h.insert('reports', { reporter_id: reporter, target_id: target, game_id: crypto.randomUUID(), reason_code: 'ABUSE', created_at: now() });
    for (let i = 0; i < 2; i += 1) {
        await h.insert('report_chat_evidence', { report_id: reportId, game_id: crypto.randomUUID(), messages: '[]', saved_at: now() });
    }
    assert.equal(await h.count('report_chat_evidence', 'report_id = :reportId', { reportId }), 2);
    await h.select('DELETE FROM reports WHERE id = :reportId', { reportId });
    assert.equal(await h.count('report_chat_evidence', 'report_id = :reportId', { reportId }), 0);
});

test('A16-B-257 문의를 지우면 답도 같이 지워짐', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('fk');
    const adminId = await h.createAdmin('fk');
    const inquiryId = await h.insert('inquiries', { user_id: userId, category: 'GAME', title: '문의', body: '문의', created_at: now(), updated_at: now() });
    for (let i = 0; i < 2; i += 1) {
        await h.insert('inquiry_replies', { inquiry_id: inquiryId, admin_id: adminId, body: '답', created_at: now() });
    }
    assert.equal(await h.count('inquiry_replies', 'inquiry_id = :inquiryId', { inquiryId }), 2);
    await h.select('DELETE FROM inquiries WHERE id = :inquiryId', { inquiryId });
    assert.equal(await h.count('inquiry_replies', 'inquiry_id = :inquiryId', { inquiryId }), 0);
});
