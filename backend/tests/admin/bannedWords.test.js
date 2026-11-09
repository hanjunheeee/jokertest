'use strict';

// 금지어 관리 서버 단위 시험 (AD-173 + 입력 검사), DB 대신 가짜 표·메모리 받침 Node 2개
// cd backend && npm test (Redis·MySQL 없이 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startPair } = require('../cluster/helpers/slice2');
const bannedWords = require('../../services/ops/bannedWords');
const reloadSync = require('../../services/ops/reloadSync');
const manage = require('../../admin/services/bannedWords/manage');
const controller = require('../../admin/controllers/bannedWords.controller');

// 가짜 표: 금지어 줄·기록 줄을 배열에 쌓음 (트랜잭션은 그냥 부름)
const fakeDb = () => {
    const rows = [];
    const logs = [];
    const asRow = (row) => ({ ...row, get: (key) => row[key] });
    return {
        rows,
        logs,
        sequelize: { transaction: async (fn) => fn({ fake: true }) },
        BannedWord: {
            findOne: async ({ where }) => {
                const found = rows.find((row) => row.word === where.word);
                return found ? asRow(found) : null;
            },
            create: async (values) => {
                const row = { id: rows.length + 1, ...values };
                rows.push(row);
                return asRow(row);
            },
        },
        AdminAuditLog: { create: async (values) => { logs.push(values); return { id: logs.length }; } },
    };
};

const fakeReq = { admin: { id: '11111111-1111-4111-8111-111111111111' }, adminRequestMeta: { ip: '203.0.113.1', accessEmail: null } };

test('AD-173: Node 둘 중 n2가 다시 읽기 실패 → 결과에 Node별 줄, partial true', async (t) => {
    t.mock.method(bannedWords, 'reloadBannedWords', async () => ({ count: 1 }));
    t.after(() => reloadSync.__testables.stopSafetyNet());
    const { n2 } = await startPair(t);
    n2.rpc.register('ops.reloadNow', () => ({ ok: false, code: 'RELOAD_FAILED' }));
    const db = fakeDb();

    const result = await manage.addWord({ req: fakeReq, word: '  나쁜말 ' }, { db });

    assert.equal(result.word.word, '나쁜말');
    assert.equal(result.word.isActive, true);
    assert.equal(result.partial, true);
    const byNode = Object.fromEntries(result.nodes.map((node) => [node.node, node]));
    assert.deepEqual(byNode.n1, { node: 'n1', ok: true });
    assert.deepEqual(byNode.n2, { node: 'n2', ok: false, code: 'RELOAD_FAILED' });
    assert.equal(db.logs.length, 1);
    assert.equal(db.logs[0].action, 'BANNED_WORD_ADD');
});

test('AD-173: Node 둘 다 받음 → 둘 다 ok, partial false', async (t) => {
    t.mock.method(bannedWords, 'reloadBannedWords', async () => ({ count: 1 }));
    t.after(() => reloadSync.__testables.stopSafetyNet());
    const { n2 } = await startPair(t);
    n2.rpc.register('ops.reloadNow', () => ({ ok: true }));

    const result = await manage.addWord({ req: fakeReq, word: 'abc' }, { db: fakeDb() });

    assert.equal(result.partial, false);
    assert.deepEqual(result.nodes.map((node) => [node.node, node.ok]).sort(), [['n1', true], ['n2', true]]);
});

test('금지어 넣기: 이미 있으면 409 BANNED_WORD_EXISTS + id·isActive, 기록·다시 읽기 없음', async (t) => {
    const reload = t.mock.fn(async () => ({ nodes: [], partial: false }));
    const db = fakeDb();
    db.rows.push({ id: 7, word: 'abc', is_active: false });

    await assert.rejects(manage.addWord({ req: fakeReq, word: 'ABC' }, { db, reload }), (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'BANNED_WORD_EXISTS');
        assert.deepEqual(error.details, { id: 7, isActive: false });
        return true;
    });
    assert.equal(db.logs.length, 0);
    assert.equal(reload.mock.callCount(), 0);
});

// 컨트롤러 입력 검사: 모르는 칸·빈 단어·긴 단어·isActive 글자 → 400 INVALID_INPUT { field }
const fieldOf = async (fn) => {
    try {
        await fn();
    } catch (error) {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'INVALID_INPUT');
        return error.details.field;
    }
    throw new Error('400이 안 남');
};
const fakeRes = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('금지어 입력 검사: 넣기·끄기·목록', async () => {
    assert.equal(await fieldOf(() => controller.add({ body: { word: '   ' } }, fakeRes())), 'word');
    assert.equal(await fieldOf(() => controller.add({ body: { word: 'a'.repeat(101) } }, fakeRes())), 'word');
    assert.equal(await fieldOf(() => controller.add({ body: { word: 'a', extra: 1 } }, fakeRes())), 'extra');
    assert.equal(await fieldOf(() => controller.toggle({ params: { id: '1' }, body: { isActive: 'false' } }, fakeRes())), 'isActive');
    assert.equal(await fieldOf(() => controller.toggle({ params: { id: 'x' }, body: { isActive: false } }, fakeRes())), 'id');
    assert.equal(await fieldOf(() => controller.list({ query: { limit: '51' } }, fakeRes())), 'limit');
    assert.equal(await fieldOf(() => controller.list({ query: { active: 'yes' } }, fakeRes())), 'active');
    assert.equal(await fieldOf(() => controller.list({ query: { before: '0' } }, fakeRes())), 'before');
});
