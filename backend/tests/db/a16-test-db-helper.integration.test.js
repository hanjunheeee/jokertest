'use strict';

// 다른 DB 시험이 다 쓰는 시험 DB 도우미(isolatedTestDb.js)가 표를 지우고 비우는 순서·막는 것을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-271~276 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, iso, schema, EXPECTED_TABLES, SEEDED_TABLES, noDb } = h;

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const now = () => new Date();

// 자식 줄 6쌍 넣기 (탈주→회원, 쿠폰 사용→쿠폰, 문의 답→문의, 신고 증거→신고, 약관 동의→약관, 옛 토큰→세션)
async function insertChildRows() {
    const userId = await h.createUser('hp');
    const otherId = await h.createUser('hp');
    const adminId = await h.createAdmin('hp');
    await h.insert('game_desertions', { user_id: userId, game_id: crypto.randomUUID(), reason: 'LEFT_ALIVE', deserted_at: now(), blocked_until: now() });
    const couponId = await h.insert('coupons', { code: `A16${crypto.randomUUID().slice(0, 8)}`, reward_type: 'GOLD', reward_amount: 1, created_at: now(), updated_at: now() });
    await h.insert('coupon_redemptions', { id: crypto.randomUUID(), coupon_id: couponId, user_id: userId, redeemed_at: now() });
    const inquiryId = await h.insert('inquiries', { user_id: userId, category: 'GAME', title: '문의', body: '문의', created_at: now(), updated_at: now() });
    await h.insert('inquiry_replies', { inquiry_id: inquiryId, admin_id: adminId, body: '답', created_at: now() });
    const reportId = await h.insert('reports', { reporter_id: userId, target_id: otherId, game_id: crypto.randomUUID(), reason_code: 'ABUSE', created_at: now() });
    await h.insert('report_chat_evidence', { report_id: reportId, game_id: crypto.randomUUID(), messages: '[]', saved_at: now() });
    const [terms] = await h.select("SELECT id FROM terms_versions WHERE kind = 'TERMS' LIMIT 1");
    await h.insert('user_terms_agreements', { user_id: userId, terms_version_id: terms.id, agreed_at: now() });
    const sessionId = `sess-${crypto.randomUUID()}`;
    await h.insert('user_sessions', { id: sessionId, user_id: userId });
    await h.insert('refresh_token_history', { session_id: sessionId, token_hash: crypto.randomBytes(32).toString('hex'), created_at: now() });
    return { userId };
}

test('A16-B-271 표 다 지우기는 자식 표부터 (외래키 오류 없이 표 0개)', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await insertChildRows();
    await iso.resetManagedSchema(db.sequelize, h.TEST_DB_URL, schema);
    assert.deepEqual(await h.listTables(), []);
});

test('A16-B-272 관리 목록이 새 표 두 개를 앎 (모르는 표 검사 통과)', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await iso.assertNoUnknownTables(db.sequelize, schema.managedTables);
    assert.ok(schema.managedTables.includes('game_desertions'));
    assert.ok(schema.managedTables.includes('game_settings'));
});

test('A16-B-273 줄 비우기는 처음 값 세 표를 남기고 나머지는 0줄, 탈주 표를 회원 표보다 먼저 비움', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await insertChildRows();
    const result = await iso.resetManagedData(db.sequelize, h.TEST_DB_URL, schema);
    assert.equal(result.cleaned, true);
    assert.equal(await h.count('maintenance_state'), 1);
    assert.equal(await h.count('terms_versions'), 2);
    assert.deepEqual(await h.select('SELECT `key`, value_int FROM game_settings'), [{ key: 'GAME_GOLD_REWARD', value_int: 1 }]);

    const filled = [];
    for (const table of EXPECTED_TABLES.filter((name) => !SEEDED_TABLES.includes(name))) {
        const n = await h.count(table);
        if (n > 0) filled.push(`${table}=${n}`);
    }
    assert.deepEqual(filled, []);
    assert.ok(result.deleted.indexOf('game_desertions') >= 0);
    assert.ok(result.deleted.indexOf('game_desertions') < result.deleted.indexOf('users'));
});

test('A16-B-274 허락 안 된 DB 이름(joker)이면 아무것도 안 지움', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    // 주소 글자에서 DB 이름만 바꿈 (그 주소로 붙지는 않음 — 도우미가 이름부터 봄)
    const wrong = new URL(h.TEST_DB_URL);
    wrong.pathname = '/joker';
    await assert.rejects(iso.resetManagedSchema(db.sequelize, wrong.toString(), schema), { message: /전용 테스트 DB 대상이 아닙니다/ });
    assert.equal((await h.listTables()).length, 49);
});

test('A16-B-275 모르는 표가 있으면 거절, 표 50개 그대로 (끝나면 그 표만 지움)', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await h.createOwnTable('zz_a16_unknown');
    try {
        await assert.rejects(iso.resetManagedSchema(db.sequelize, h.TEST_DB_URL, schema), { message: /관리 목록이 모르는 테이블/ });
        assert.equal((await h.listTables()).length, 50);
    } finally {
        await h.dropOwnTables();
    }
    assert.equal((await h.listTables()).length, 49);
});

test('A16-B-276 [지금 동작] 표가 덜 올라간 DB(0033까지)는 줄 비우기 안 함', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(33);
    const userId = await h.createUser('hp');
    const result = await iso.resetManagedData(db.sequelize, h.TEST_DB_URL, schema);
    assert.equal(result.cleaned, false);
    assert.deepEqual(result.missingTables, ['game_settings']);
    assert.deepEqual(result.deleted, []);
    assert.equal(await h.count('users', 'uuid = :userId', { userId }), 1);
    assert.equal(await h.count('schema_migrations'), 33);
});
