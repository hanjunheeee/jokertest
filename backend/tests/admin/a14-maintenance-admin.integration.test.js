'use strict';

// 관리자 점검 요청 시험: 켜기 저장(표·nodes·기록 전후 값)·켤 때 몸 검사·지난 시각은 지금으로·서버 하나가 못 받음 (진짜 관리자 경로 + 시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-239~244 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3), 켜진 뒤 게임 동작은 A18
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a14-ops-helpers');
const maintenance = require('../../services/ops/maintenance');

const { db } = H;
const ctx = H.useAdminFile();
const MINUTE = 60_000;

const put = (body) => ctx.app.agent.request('PUT', '/admin-api/maintenance', { body });
const stateRow = () => db.MaintenanceState.findOne({ where: { id: 1 }, raw: true });
const iso = (ms) => new Date(ms).toISOString();

// 점검 줄은 공용 설정 → 시험 앞 모양을 적어 두고 끝에 그대로 돌려놓음 + 이 서버 점검 상태도 다시 읽음
async function keepState(t) {
    const saved = await stateRow();
    t.after(async () => {
        if (saved) await db.MaintenanceState.update(saved, { where: { id: 1 } });
        else await db.MaintenanceState.destroy({ where: { id: 1 } });
        await maintenance.reloadMaintenance();
    });
}

test('A14-B-239 켜기 { enabled, message, startsAt 30분 뒤, endsAt 2시간 뒤 } → maintenance_state 1번 줄 바뀜, nodes, 기록 MAINTENANCE_UPDATE 전후 값', async (t) => {
    if (H.noDb(t)) return;
    await keepState(t);
    const now = Date.now();
    const startsAt = Math.floor((now + 30 * MINUTE) / 1000) * 1000;
    const endsAt = Math.floor((now + 120 * MINUTE) / 1000) * 1000;
    const before = (await H.myAudits(ctx.app.admin, { action: 'MAINTENANCE_UPDATE' })).length;
    const res = await put({ enabled: true, message: '서버 점검 안내', startsAt: iso(startsAt), endsAt: iso(endsAt) });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.nodes) && res.body.nodes.length >= 1, 'nodes 있음');
    const row = await stateRow();
    assert.equal(Boolean(row.is_enabled), true);
    assert.equal(row.message, '서버 점검 안내');
    assert.equal(new Date(row.starts_at).getTime(), startsAt);
    assert.equal(new Date(row.ends_at).getTime(), endsAt);
    const audits = await H.myAudits(ctx.app.admin, { action: 'MAINTENANCE_UPDATE' });
    assert.equal(audits.length, before + 1);
    const last = audits.at(-1);
    assert.equal(last.after_value.enabled, true);
    assert.equal(last.after_value.startsAt, iso(startsAt));
    assert.ok('before_value' in last, '전 값 칸');
});

// A14-B-240~242 켤 때 몸 검사 (값 3)
test('A14-B-240 켜는데 startsAt 없음 → 400 field startsAt, 표 그대로', async (t) => {
    if (H.noDb(t)) return;
    await keepState(t);
    const saved = await stateRow();
    H.assertInvalid(await put({ enabled: true, message: '점검' }), 'startsAt');
    assert.deepEqual(await stateRow(), saved);
});

test('A14-B-241 endsAt ≤ startsAt → 400 field endsAt, 표 그대로', async (t) => {
    if (H.noDb(t)) return;
    await keepState(t);
    const saved = await stateRow();
    const startsAt = Date.now() + 30 * MINUTE;
    H.assertInvalid(await put({ enabled: true, message: '점검', startsAt: iso(startsAt), endsAt: iso(startsAt) }), 'endsAt');
    assert.deepEqual(await stateRow(), saved);
});

test('A14-B-242 안내 글 501자 → 400 field message, 500자 → 200', async (t) => {
    if (H.noDb(t)) return;
    await keepState(t);
    H.assertInvalid(await put({ enabled: false, message: '가'.repeat(501) }), 'message');
    const ok = await put({ enabled: false, message: '가'.repeat(500) });
    assert.equal(ok.status, 200);
    assert.equal((await stateRow()).message, '가'.repeat(500));
});

test('A14-B-243 startsAt = 10분 전 → 저장된 시작 시각 = 요청 시각 (초 단위)', async (t) => {
    if (H.noDb(t)) return;
    await keepState(t);
    const sentAt = Date.now();
    const res = await put({ enabled: true, message: '지금 점검', startsAt: iso(sentAt - 10 * MINUTE) });
    const doneAt = Date.now();
    assert.equal(res.status, 200);
    const stored = new Date((await stateRow()).starts_at).getTime();
    assert.ok(stored >= Math.floor(sentAt / 1000) * 1000 && stored <= doneAt, `저장 시각 ${iso(stored)}가 요청 시각(${iso(sentAt)}~${iso(doneAt)}) 안`);
});

test('A14-B-244 메모리 서버 둘 중 ㄴ이 다시 읽기 답 없음 → nodes ㄴ ok:false·code, partial true, 저장은 됨', async (t) => {
    if (H.noDb(t)) return;
    await keepState(t);
    const { selfId, otherId } = await H.startTwoNodes(t, { answers: false });
    const startsAt = Math.floor((Date.now() + 30 * MINUTE) / 1000) * 1000;
    const res = await put({ enabled: true, message: 'ㄴ 못 받음', startsAt: iso(startsAt) });
    assert.equal(res.status, 200);
    const byNode = new Map(res.body.nodes.map((n) => [n.node, n]));
    assert.equal(byNode.get(selfId)?.ok, true);
    assert.equal(byNode.get(otherId)?.ok, false);
    assert.equal(typeof byNode.get(otherId)?.code, 'string');
    assert.equal(res.body.partial, true);
    const row = await stateRow();
    assert.equal(Boolean(row.is_enabled), true);
    assert.equal(row.message, 'ㄴ 못 받음');
});
