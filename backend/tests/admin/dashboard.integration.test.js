'use strict';

// 운영 현황 통합 시험 (AD-110), 진짜 시험 DB + 관리자 라우터 → GET /admin-api/dashboard 숫자가 DB와 맞음
// npm run test:with-db -- tests/admin/dashboard.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-dashboard-integration-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const HOUR_MS = 60 * 60 * 1000;

// 시험 회원 하나 (닉네임·이메일 겹치지 않게)
const makeUser = async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    return db().User.create({ nickname: `현황${tag}`, email: `dash-${tag}@example.com`, password_hash: 'x' });
};

// 끝난 판 하나 (ended_at 주어진 시각)
const makeGame = (endedAt) => db().GameResult.create({
    id: crypto.randomUUID(), started_at: new Date(endedAt.getTime() - HOUR_MS), ended_at: endedAt,
    winner: 'CITIZEN', day_index: 2, player_count: 5,
});

const readDashboard = async (agent) => {
    const res = await agent.get('/admin-api/dashboard');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
};

test('AD-110: 가입자(탈퇴 뺌)·오늘 끝난 판·새 신고·새 문의 수가 DB와 맞음', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const before = await readDashboard(agent);

    const [alive, other, gone] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    await gone.destroy();
    const now = new Date();
    await makeGame(new Date(now.getTime() - 60 * 1000));
    await makeGame(new Date(now.getTime() - 3 * 24 * HOUR_MS));
    const gameId = crypto.randomUUID();
    await db().Report.create({ reporter_id: alive.uuid, target_id: other.uuid, game_id: gameId, reason_code: 'ABUSE' });
    await db().Report.create({ reporter_id: other.uuid, target_id: alive.uuid, game_id: gameId, reason_code: 'ABUSE', status: 'RESOLVED' });
    await db().Inquiry.create({ user_id: alive.uuid, category: 'BUG', title: '안 돼요', body: '내용' });
    await db().Inquiry.create({ user_id: other.uuid, category: 'ETC', title: '답함', body: '내용', status: 'ANSWERED' });

    const after = await readDashboard(agent);
    assert.equal(after.ok, true);
    assert.equal(after.totalMembers - before.totalMembers, 2);
    assert.equal(after.todayGames.finished - before.todayGames.finished, 1);
    assert.equal(after.openReports - before.openReports, 1);
    assert.equal(after.openInquiries - before.openInquiries, 1);
    // 시험 서버엔 진행 판 없음 → 오늘 총 판 수 = 끝난 판 수
    assert.equal(after.todayGames.inProgress, 0);
    assert.equal(after.todayGames.total, after.todayGames.finished);
    assert.equal(after.inProgressGames, 0);
    assert.equal(typeof after.onlineCount, 'number');
    assert.equal(typeof after.maintenance.enabled, 'boolean');
    assert.equal(after.liveError, undefined);
});

test('AD-110: 로그인 안 하면 막힘 (401)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    await agent.post('/admin-api/auth/logout');
    const res = await agent.get('/admin-api/dashboard');
    assert.equal(res.status, 401);
});
