'use strict';

// 회원 기능 시험: 약관 버전 고르기 · 만 14세 셈 · 가입 동의 검사·기록 · 재동의 · 가입 두 갈래 연결 · 오류 문구 · 마이그레이션 0026·0027
// DB 안 씀 (약관 저장소·사용자 저장소 가짜), 시각은 넘겨주는 값
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-member-terms-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const termsService = require('../../services/auth/terms');
const termsRepository = require('../../repositories/auth/terms');
const { ageOn, isOldEnoughToSignup, normalizeAgreedIds } = require('../../validations/auth/terms');
const authService = require('../../services/auth/account');
const social = require('../../services/auth/social');
const signupEmailVerificationService = require('../../services/auth/signupEmailVerification');
const economyService = require('../../services/economy');
const { globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const termsMigration = require('../../db/migrations/0026-add-terms-agreements');
const dropTitleMigration = require('../../db/migrations/0027-drop-user-stats-title-reputation');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const { useAuthStore, swap } = require('./authFakes');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

const NOW = new Date('2026-11-09T03:00:00.000Z');
const utcDate = (iso) => new Date(`${iso}T00:00:00.000Z`);

// 약관 표 가짜: 버전 목록 + 동의 기록
const useTermsTable = (t, versions) => {
    const agreements = [];
    swap(t, termsRepository, 'findAllVersions', async () => versions.map((row) => ({ ...row })));
    swap(t, termsRepository, 'findAgreedVersionIds', async (userId) => agreements.filter((a) => a.userId === userId).map((a) => a.versionId));
    swap(t, termsRepository, 'createAgreements', async (userId, ids, agreedAt) => {
        for (const versionId of ids) {
            if (!agreements.some((a) => a.userId === userId && a.versionId === versionId)) agreements.push({ userId, versionId, agreedAt });
        }
    });
    return agreements;
};
const V = (id, kind, effective, extra = {}) => ({
    id, kind, version: `v${id}`, title: kind, body: '자리', url: null, effective_at: new Date(effective), is_required: 1, ...extra,
});
const PLACEHOLDERS = [V(1, 'TERMS', '2026-11-01T00:00:00Z'), V(2, 'PRIVACY', '2026-11-01T00:00:00Z')];

// ── 지금 버전 고르기 ──

test('약관 고르기: 종류마다 시행일 지난 것 중 가장 늦은 것, 아직 시행 전 버전은 뺌', () => {
    const rows = [
        V(1, 'TERMS', '2026-10-01T00:00:00Z'), V(3, 'TERMS', '2026-11-05T00:00:00Z'), V(5, 'TERMS', '2026-12-01T00:00:00Z'),
        V(2, 'PRIVACY', '2026-10-01T00:00:00Z'),
    ];
    assert.deepEqual(termsService.pickCurrentVersions(rows, NOW).map((row) => row.id), [2, 3]);
});

test('약관 고르기: 시행일이 같으면 id 큰 것', () => {
    const rows = [V(7, 'TERMS', '2026-11-01T00:00:00Z'), V(9, 'TERMS', '2026-11-01T00:00:00Z')];
    assert.deepEqual(termsService.pickCurrentVersions(rows, NOW).map((row) => row.id), [9]);
});

test('지금 약관 목록: 화면 모양 (필수 여부 1/0 → 참/거짓, 관리자 id 안 보냄)', async (t) => {
    useTermsTable(t, [V(1, 'TERMS', '2026-11-01T00:00:00Z', { created_by_admin_id: 'admin-1' }), V(2, 'PRIVACY', '2026-11-01T00:00:00Z', { is_required: 0 })]);
    const list = await termsService.getCurrentTerms({ now: NOW });
    assert.deepEqual(list.map((x) => [x.id, x.kind, x.required]), [[2, 'PRIVACY', false], [1, 'TERMS', true]]);
    assert.equal(Object.hasOwn(list[0], 'created_by_admin_id'), false);
    assert.equal(list[1].effectiveAt, '2026-11-01T00:00:00.000Z');
});

// ── 만 나이 ──

test('만 나이: 한국 날짜로 생일 당일부터 한 살 더함 (UTC로는 전날이어도)', () => {
    // 2026-11-09 15:30Z = 한국 11-10 00:30
    const birth = utcDate('2012-11-10');
    assert.equal(ageOn(birth, new Date('2026-11-09T14:59:00Z')), 13);
    assert.equal(ageOn(birth, new Date('2026-11-09T15:30:00Z')), 14);
    assert.equal(isOldEnoughToSignup(birth, new Date('2026-11-09T15:30:00Z')), true);
});

test('만 나이: 생일 모르면 null, 14세 판정은 거짓', () => {
    assert.equal(ageOn(null, NOW), null);
    assert.equal(isOldEnoughToSignup(new Date('x'), NOW), false);
});

test('동의 id 정리: 양의 정수·숫자 글자만, 겹침 뺌, 배열 아니면 null', () => {
    assert.deepEqual(normalizeAgreedIds([2, '3', 2, -1, 'x', 1.5]), [2, 3]);
    assert.equal(normalizeAgreedIds('1,2'), null);
});

// ── 가입 동의 검사 ──

test('가입 검사: 만 14세 확인 체크 없으면 AGE_CONFIRM_REQUIRED', async (t) => {
    useTermsTable(t, PLACEHOLDERS);
    await assert.rejects(
        termsService.checkSignupAgreements({ agreedTermsVersionIds: [1, 2], ageConfirmed: false, birthDate: utcDate('2000-01-01') }, { now: NOW }),
        (e) => e.code === 'AGE_CONFIRM_REQUIRED' && e.status === 400,
    );
});

test('가입 검사: 체크했어도 생일이 만 14세 미만이면 AGE_UNDER_14', async (t) => {
    useTermsTable(t, PLACEHOLDERS);
    await assert.rejects(
        termsService.checkSignupAgreements({ agreedTermsVersionIds: [1, 2], ageConfirmed: true, birthDate: utcDate('2012-11-10') }, { now: NOW }),
        (e) => e.code === 'AGE_UNDER_14',
    );
});

test('가입 검사: 필수 약관 하나 빠지면 TERMS_AGREEMENT_REQUIRED (옛 버전 id만 들고 와도)', async (t) => {
    useTermsTable(t, [...PLACEHOLDERS, V(3, 'TERMS', '2026-11-08T00:00:00Z')]);
    await assert.rejects(
        termsService.checkSignupAgreements({ agreedTermsVersionIds: [1, 2], ageConfirmed: true, birthDate: utcDate('2000-01-01') }, { now: NOW }),
        (e) => e.code === 'TERMS_AGREEMENT_REQUIRED',
    );
});

test('가입 검사: 통과하면 지금 버전 중 동의한 id만 돌려줌 (모르는 id는 뺌)', async (t) => {
    useTermsTable(t, PLACEHOLDERS);
    const ids = await termsService.checkSignupAgreements(
        { agreedTermsVersionIds: [2, 1, 99], ageConfirmed: true, birthDate: utcDate('2012-11-09') }, { now: NOW },
    );
    assert.deepEqual(ids.sort(), [1, 2]);
});

// ── 재동의 ──

test('재동의: 새 필수 버전이 시행되면 그것만 필요 목록에 뜨고, 동의하면 비워짐', async (t) => {
    const table = [...PLACEHOLDERS];
    useTermsTable(t, table);
    await termsService.recordAgreements('u1', [1, 2], { now: NOW });
    assert.deepEqual(await termsService.getPendingTerms('u1', { now: NOW }), []);

    table.push(V(3, 'PRIVACY', '2026-11-09T00:00:00Z'));
    const pending = await termsService.getPendingTerms('u1', { now: NOW });
    assert.deepEqual(pending.map((x) => x.id), [3]);

    const result = await termsService.agreeToTerms('u1', [3], { now: NOW });
    assert.deepEqual(result.pending, []);
});

test('재동의: 지금 버전이 아닌 id면 TERMS_VERSION_OUTDATED 409, 빈 목록이면 400', async (t) => {
    useTermsTable(t, [...PLACEHOLDERS, V(3, 'PRIVACY', '2026-11-09T00:00:00Z')]);
    await assert.rejects(termsService.agreeToTerms('u1', [2], { now: NOW }), (e) => e.code === 'TERMS_VERSION_OUTDATED' && e.status === 409);
    await assert.rejects(termsService.agreeToTerms('u1', [], { now: NOW }), (e) => e.code === 'TERMS_AGREEMENT_REQUIRED');
});

test('재동의: 필수 아닌 새 버전은 필요 목록에 안 뜸', async (t) => {
    const agreements = useTermsTable(t, [...PLACEHOLDERS, V(3, 'TERMS', '2026-11-09T00:00:00Z', { is_required: false })]);
    agreements.push({ userId: 'u1', versionId: 2 });
    assert.deepEqual(await termsService.getPendingTerms('u1', { now: NOW }), []);
});

// ── 가입 두 갈래에 연결 ──

const SIGNUP_BODY = {
    email: 'member@example.com', password: 'password-123', passwordConfirm: 'password-123',
    nickname: '가면새내기', birthDate: '2000-01-01', signupProof: 'proof-x',
};

test('이메일 가입: 동의 없으면 해시·트랜잭션 전에 거절, 맞으면 동의 기록을 새 계정 uuid로 남김', async (t) => {
    const store = useAuthStore(t);
    const agreements = useTermsTable(t, PLACEHOLDERS);
    swap(t, signupEmailVerificationService, 'consumeSignupProof', async () => ({ ok: true }));
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));

    await assert.rejects(authService.signup({ ...SIGNUP_BODY }), (e) => e.code === 'AGE_CONFIRM_REQUIRED');
    assert.equal(store.names().includes('withTransaction'), false, '거절은 트랜잭션 열기 전');

    const user = await authService.signup({ ...SIGNUP_BODY, ageConfirmed: true, agreedTermsVersionIds: [1, 2] });
    assert.deepEqual(agreements.map((a) => [a.userId, a.versionId]).sort(), [[user.uuid, 1], [user.uuid, 2]]);
});

test('이메일 가입: 생일이 만 14세 미만이면 계정 안 만듦', async (t) => {
    const store = useAuthStore(t);
    useTermsTable(t, PLACEHOLDERS);
    await assert.rejects(
        authService.signup({ ...SIGNUP_BODY, birthDate: '2020-01-01', ageConfirmed: true, agreedTermsVersionIds: [1, 2] }),
        (e) => e.code === 'AGE_UNDER_14',
    );
    assert.equal(store.data.users.length, 0);
});

test('소셜 가입: 필수 약관 빠지면 의도 안 쓰고 거절, 맞으면 동의 기록', async (t) => {
    const store = useAuthStore(t);
    const agreements = useTermsTable(t, PLACEHOLDERS);
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    swap(t, authService, 'issueSessionForUser', async () => ({ token: 'access', refreshToken: null, refreshTokenExpiresAt: null }));
    const crypto = require('node:crypto');
    const raw = 'intent-terms-1';
    store.data.intents.push({
        id: 'intent-row-1', intent_token_hash: crypto.createHash('sha256').update(raw).digest('hex'),
        provider: 'google', subject: 'g-terms', email: 'social-terms@example.com',
        expires_at: new Date(Date.now() + 10 * 60 * 1000), consumed_at: null,
    });
    const base = { intentToken: raw, nickname: '소셜새내기', birthDate: '2000-01-01', ageConfirmed: true };

    await assert.rejects(social.completeSocialSignup({ ...base, agreedTermsVersionIds: [1] }), (e) => e.code === 'TERMS_AGREEMENT_REQUIRED');
    assert.equal(store.data.intents[0].consumed_at, null);

    const { user } = await social.completeSocialSignup({ ...base, agreedTermsVersionIds: [1, 2] });
    assert.equal(agreements.length, 2);
    assert.ok(store.data.users.find((u) => u.uuid === user.uuid).last_login_at instanceof Date, '소셜 가입 마무리도 마지막 접속 시각');
});

// ── 오류 문구 (가입 경로는 정한 코드만 내보냄) ──

test('가입 경로 오류 처리기: 약관·나이 코드는 500으로 뭉개지지 않고 400 + 정한 문구', async (t) => {
    const app = express();
    app.post('/auth/signup', (req, res, next) => {
        const error = new Error('x'); error.name = 'AppError'; error.status = 400; error.code = req.headers['x-code'];
        next(error);
    });
    app.use(globalErrorHandler);
    const server = require('node:http').createServer(app);
    const { url: base } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `${base}/auth/signup`;
    for (const code of ['TERMS_AGREEMENT_REQUIRED', 'AGE_CONFIRM_REQUIRED', 'AGE_UNDER_14']) {
        const res = await fetch(url, { method: 'POST', headers: { 'x-code': code } });
        const body = await res.json();
        assert.equal(res.status, 400, code);
        assert.equal(body.code, code);
        assert.ok(body.message.length > 0);
    }
});

// ── 마이그레이션 ──

const fakeQueryInterface = (initialTables = {}) => {
    const tables = JSON.parse(JSON.stringify(initialTables));
    const calls = [];
    return {
        tables, calls,
        async showAllTables() { return Object.keys(tables); },
        async createTable(name, columns) {
            calls.push(['createTable', name]);
            tables[name] = { columns: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, { allowNull: v.allowNull, primaryKey: Boolean(v.primaryKey) }])), indexes: [] };
        },
        async showIndex(name) { return tables[name].indexes.map((i) => ({ ...i, fields: i.fields.map((attribute) => ({ attribute })) })); },
        async addIndex(name, fields, options) { calls.push(['addIndex', name, options.name]); tables[name].indexes.push({ name: options.name, unique: Boolean(options.unique), fields }); },
        async describeTable(name) { return tables[name].columns; },
        async removeColumn(name, column) { calls.push(['removeColumn', name, column]); delete tables[name].columns[column]; },
        async addColumn(name, column) { calls.push(['addColumn', name, column]); tables[name].columns[column] = { allowNull: true }; },
    };
};

test('마이그레이션 0026: 표 2개·인덱스 4개 만들고 자리용 약관 2개 넣음, 다시 돌려도 안 겹침', async () => {
    const qi = fakeQueryInterface();
    const queries = [];
    const sequelize = { query: async (sql, options) => { queries.push(options.replacements); return [[]]; } };
    const Sequelize = new Proxy({}, { get: (_, key) => (key === 'STRING' ? () => 'STRING' : key) });
    await termsMigration.up(qi, Sequelize, sequelize);
    await termsMigration.verify(qi);
    assert.deepEqual(qi.calls.filter((c) => c[0] === 'createTable').map((c) => c[1]), ['terms_versions', 'user_terms_agreements']);
    assert.equal(qi.calls.filter((c) => c[0] === 'addIndex').length, 4);
    assert.deepEqual(queries.map((r) => [r.kind, r.title]), [['TERMS', '이용약관'], ['PRIVACY', '개인정보 처리방침']]);
    assert.match(queries[0].body, /자리용/);
    assert.match(queries[0].body, /90일/);

    await termsMigration.up(qi, Sequelize, sequelize);
    assert.equal(qi.calls.filter((c) => c[0] === 'createTable').length, 2, '있는 표는 안 만듦');
});

test('마이그레이션 0027: user_stats의 title·reputation만 지우고 다시 돌려도 안전', async () => {
    const qi = fakeQueryInterface({ user_stats: { columns: { user_id: {}, reputation: {}, title: {}, total_games: {} }, indexes: [] } });
    await dropTitleMigration.up(qi);
    await dropTitleMigration.verify(qi);
    assert.deepEqual(Object.keys(qi.tables.user_stats.columns), ['user_id', 'total_games']);
    await dropTitleMigration.up(qi);
    assert.equal(qi.calls.filter((c) => c[0] === 'removeColumn').length, 2);
});

test('마이그레이션 목록: 0025 다음에 0026·0027이 차례로 붙어 있음', () => {
    const names = MIGRATIONS.map((m) => m.name);
    const at = names.indexOf('0026-add-terms-agreements');
    assert.ok(at > names.indexOf('0025-add-period-indexes'));
    assert.equal(names[at + 1], '0027-drop-user-stats-title-reputation');
});
