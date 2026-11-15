'use strict';

// 관리자 오류 모양 시험: 처리 중 모르는 오류(DB에 못 닿음)가 나면 500 { ok:false, code:'ADMIN_INTERNAL', message }만, 속 오류 글·스택은 안 실림
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-107 (DB 없음, 돌리기: node --env-file=.env.test --test)
// 모델이 닿지 않는 DB 주소를 보게 → 세션 확인에서 DB 오류가 남 (DB 없이 낼 수 있는 진짜 "모르는 오류")
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { startAdminServer, createAgent, randomIp } = require('./helpers/adminTestApp');
const { gateEnv } = require('./a14-gate-helpers');

let server = null;
let restoreEnv = null;
test.before(async () => {
    restoreEnv = gateEnv();
    server = await startAdminServer();
});
test.after(async () => {
    if (server) await server.close();
    if (restoreEnv) restoreEnv();
    await require('../../models').sequelize.close();
});

test('A14-B-107 처리 중 모르는 오류 → 500 { ok:false, code:ADMIN_INTERNAL, message }, 속 오류 글·스택 없음', async (t) => {
    // 서버 기록 줄은 조용히 (시험 출력만 깨끗하게)
    t.mock.method(console, 'error', () => {});
    // 모양이 맞는 관리자 쿠키 (43자) → DB에서 찾다 오류
    const raw = crypto.randomBytes(32).toString('base64url');
    const agent = createAgent({ url: server.url, ip: randomIp() });
    const res = await agent.get('/admin-api/members', { headers: { cookie: `mmc_admin_sid=${raw}` } });
    assert.equal(res.status, 500);
    assert.deepEqual(Object.keys(res.body).sort(), ['code', 'message', 'ok']);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'ADMIN_INTERNAL');
    assert.equal(typeof res.body.message, 'string');
    const text = JSON.stringify(res.body);
    for (const leak of ['ECONNREFUSED', '127.0.0.1', 'Sequelize', 'blocked', 'at ', '.js:']) {
        assert.ok(!text.includes(leak), `속 오류 글 "${leak}" 실림`);
    }
});
