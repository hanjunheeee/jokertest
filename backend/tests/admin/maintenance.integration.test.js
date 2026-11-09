'use strict';

// 관리자 점검 경로 통합 시험 (AD-130·141 + 모양 검사), 진짜 시험 DB + 로그인된 시험 앱
// npm run test:with-db -- tests/admin/maintenance.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');
const maintenance = require('../../services/ops/maintenance');
const cluster = require('../../cluster');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => {
    maintenance.__setStateForTests({ enabled: false });
    require('../../services/ops/reloadSync').__testables.stopSafetyNet();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const put = (agent, body) => agent.request('PUT', '/admin-api/maintenance', { body });
const inMinutes = (min) => new Date(Date.now() + min * 60_000);
const toSecond = (date) => new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();

test('AD-130: 점검 저장 → DB 한 줄·이 Node 상태·기록 MAINTENANCE_UPDATE·응답 nodes', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const startsAt = inMinutes(30);
    const endsAt = inMinutes(90);
    const res = await put(agent, { enabled: true, message: ' 정기 점검 ', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.nodes, [{ node: cluster.serverId(), ok: true }]);
    assert.equal(res.body.partial, false);
    assert.equal(res.body.maintenance.enabled, true);
    assert.equal(res.body.maintenance.active, false);
    assert.equal(res.body.maintenance.message, '정기 점검');
    assert.equal(res.body.maintenance.startsAt, toSecond(startsAt));

    const row = await db().MaintenanceState.findOne({ where: { id: 1 } });
    assert.equal(Boolean(row.is_enabled), true);
    assert.equal(row.updated_by_admin_id, admin.id);
    assert.equal(maintenance.getMaintenanceState().enabled, true, '이 Node 메모리 상태도 다시 읽음');
    assert.equal(maintenance.getMaintenanceState().startsAt, toSecond(startsAt));

    const log = await db().AdminAuditLog.findOne({ where: { admin_id: admin.id, action: 'MAINTENANCE_UPDATE' }, order: [['id', 'DESC']] });
    assert.equal(log.after_value.enabled, true);
    assert.equal(log.after_value.message, '정기 점검');

    const got = await agent.get('/admin-api/maintenance');
    assert.equal(got.status, 200);
    assert.equal(got.body.maintenance.startsAt, toSecond(startsAt));
    assert.equal(got.body.liveGames, 0);
    assert.equal(got.body.liveRooms, 0);

    // 끄기 → 꺼짐 상태·기록 한 줄 더
    const off = await put(agent, { enabled: false, message: null, startsAt: null, endsAt: null });
    assert.equal(off.status, 200);
    assert.equal(off.body.maintenance.enabled, false);
    assert.equal(maintenance.getMaintenanceState().enabled, false);
    const count = await db().AdminAuditLog.count({ where: { admin_id: admin.id, action: 'MAINTENANCE_UPDATE' } });
    assert.equal(count, 2);
});

test('AD-130: 켤 때 지난 시작 시각은 지금으로 → 바로 점검 중', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const before = Date.now();
    const res = await put(agent, { enabled: true, message: '', startsAt: inMinutes(-60).toISOString(), endsAt: null });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Date.parse(res.body.maintenance.startsAt) >= Math.floor(before / 1000) * 1000);
    assert.equal(res.body.maintenance.active, true);
    assert.equal(maintenance.isMaintenanceActive(), true);
    await put(agent, { enabled: false, message: null, startsAt: null, endsAt: null });
});

test('AD-130: 모양 틀림 → 400 INVALID_INPUT { field }', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const cases = [
        [{ enabled: true, message: 'x', startsAt: null, endsAt: null }, 'startsAt'],
        [{ enabled: 'yes', message: 'x', startsAt: null, endsAt: null }, 'enabled'],
        [{ enabled: false, message: 'x'.repeat(501), startsAt: null, endsAt: null }, 'message'],
        [{ enabled: true, startsAt: 'not-a-date' }, 'startsAt'],
        [{ enabled: true, startsAt: inMinutes(10).toISOString(), endsAt: inMinutes(5).toISOString() }, 'endsAt'],
        [{ enabled: false, extra: 1 }, 'extra'],
    ];
    for (const [body, field] of cases) {
        const res = await put(agent, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.deepEqual([res.body.code, res.body.field], ['INVALID_INPUT', field]);
    }
});

test('AD-130: 쓰기 확인 머리글 없으면 403 (점검은 쓰기)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const res = await agent.request('PUT', '/admin-api/maintenance', {
        body: { enabled: false }, headers: { 'x-admin-csrf': undefined },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_CSRF_FAILED');
});

test('AD-141: 강제 종료 결과 → 기록 MAINTENANCE_FORCE_END(Node·판 수·방 수, 관리자 = 마지막으로 점검 고친 사람), 보기에 Node별 결과', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const saved = await put(agent, { enabled: true, message: '점검', startsAt: inMinutes(20).toISOString(), endsAt: null });
    const { startsAt } = saved.body.maintenance;
    const update = require('../../admin/services/maintenance/update');
    await update.recordForceEnd({ node: 'n1', games: 2, rooms: 1, startsAt });
    await update.recordForceEnd({ node: 'n2', games: 0, rooms: 3, startsAt });

    const log = await db().AdminAuditLog.findOne({ where: { action: 'MAINTENANCE_FORCE_END', target_id: 'n1' }, order: [['id', 'DESC']] });
    assert.equal(log.admin_id, admin.id);
    assert.deepEqual(log.after_value, { node: 'n1', games: 2, rooms: 1, startsAt });

    const got = await agent.get('/admin-api/maintenance');
    assert.deepEqual(got.body.forceEnds.map(({ node, games, rooms }) => [node, games, rooms]).sort(), [['n1', 2, 1], ['n2', 0, 3]]);
    await put(agent, { enabled: false, message: null, startsAt: null, endsAt: null });
});

test('AD-141: 이 Node 점검 시계 알림이 기록으로 이어짐 (update.js가 onForceEnd에 붙어 있음)', async (t) => {
    if (skipWithoutDb(t)) return;
    const update = require('../../admin/services/maintenance/update');
    const calls = [];
    t.mock.method(update, 'recordForceEnd', async (report) => { calls.push(report); });
    const { clock } = require('../../services/ops/maintenanceClock');
    clock.notifyForceEnd({ node: 'n1', games: 1, rooms: 0, startsAt: '2026-11-10T03:00:00.000Z' });
    assert.deepEqual(calls, [{ node: 'n1', games: 1, rooms: 0, startsAt: '2026-11-10T03:00:00.000Z' }]);
});
