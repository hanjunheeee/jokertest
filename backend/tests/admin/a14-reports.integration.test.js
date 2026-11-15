'use strict';

// 관리자 신고 처리 시험: 상태별 목록·증거 보기(채널별 시각 순·기록)·처리(정지·끊김)·기각·두 관리자 동시 처리·증거 없음·처리 시각 UTC (시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-224~230 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const H = require('./a14-ops-helpers');
const { adminTestApp } = require('./helpers/adminTestApp');

const { db } = H;
const ctx = H.useAdminFile();

// 신고 한 줄 (판 하나에 신고자 → 대상), 판 id는 시험마다 새로
async function addReport({ status = 'OPEN', gameId = crypto.randomUUID(), at = Date.now() } = {}) {
    const reporter = await H.createPlayer('rp');
    const target = await H.createPlayer('tg');
    const row = await db.Report.create({
        reporter_id: reporter.uuid, target_id: target.uuid, game_id: gameId, reason_code: 'ABUSE', status, created_at: new Date(at),
    });
    return { id: Number(row.id), gameId, reporter, target };
}

const resolveBody = { ban: { kind: 'PERIOD', days: 7, reason: '욕설' }, memo: '확인함' };

test('A14-B-224 신고 OPEN 2·RESOLVED 1 → ?status=OPEN 이 판 것 2개', async (t) => {
    if (H.noDb(t)) return;
    const gameId = crypto.randomUUID();
    const open = [await addReport({ gameId }), await addReport({ gameId })];
    await addReport({ gameId, status: 'RESOLVED' });
    const res = await ctx.app.agent.get('/admin-api/reports?status=OPEN');
    assert.equal(res.status, 200);
    const mine = res.body.items.filter((item) => item.gameId === gameId);
    assert.deepEqual(mine.map((item) => item.id).sort(), open.map((r) => r.id).sort());
    assert.ok(mine.every((item) => item.status === 'OPEN'));
});

test('A14-B-225 8명 판 채팅 증거 있는 신고 → 상세 증거 채널별·시각 순, 기록 VIEW_EVIDENCE', async (t) => {
    if (H.noDb(t)) return;
    const report = await addReport();
    const base = Date.UTC(2026, 10, 16, 3, 0, 0);
    const channels = ['DAY', 'DEAD', 'JOKER'];
    // 8명이 한 줄씩 (넣는 차례는 시각 순이 아니게 뒤섞음)
    const messages = Array.from({ length: 8 }, (_, i) => ({
        at: new Date(base + ((i * 5) % 8) * 1000).toISOString(),
        channel: channels[i % 3],
        senderUuid: crypto.randomUUID(),
        nickname: `닉${i}`,
        text: `말${i}`,
    }));
    await db.ReportChatEvidence.create({ report_id: report.id, game_id: report.gameId, messages });
    const before = (await H.myAudits(ctx.app.admin, { action: 'VIEW_EVIDENCE', targetId: report.id })).length;
    const res = await ctx.app.agent.get(`/admin-api/reports/${report.id}`);
    assert.equal(res.status, 200);
    const got = res.body.evidence.messages;
    assert.equal(got.length, 8);
    assert.deepEqual(got.map((m) => m.at), [...messages.map((m) => m.at)].sort());
    assert.deepEqual([...new Set(got.map((m) => m.channel))].sort(), [...channels].sort());
    for (const m of got) assert.equal(m.channel, messages.find((x) => x.text === m.text).channel, '채널 그대로');
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'VIEW_EVIDENCE', targetId: report.id })).length, before + 1);
});

test('A14-B-226 처리(정지) → 신고 RESOLVED·처리한 관리자·처리 시각, 대상 정지 줄, 대상 끊김, 기록 REPORT_RESOLVE·BAN', async (t) => {
    if (H.noDb(t)) return;
    const online = H.fakeOnline(t);
    const report = await addReport();
    const sock = online.connect(report.target.uuid);
    const res = await ctx.app.agent.post(`/admin-api/reports/${report.id}/resolve`, resolveBody);
    assert.equal(res.status, 200);
    assert.equal(res.body.report.status, 'RESOLVED');
    assert.equal(res.body.report.handledBy, ctx.app.admin.loginId);
    assert.ok(res.body.report.handledAt, '처리 시각');
    const row = await db.Report.findByPk(report.id, { raw: true });
    assert.equal(row.status, 'RESOLVED');
    assert.equal(row.handled_by_admin_id, ctx.app.admin.id);
    assert.equal(await db.UserBan.count({ where: { user_id: report.target.uuid } }), 1);
    assert.equal(sock.connected, false, '대상 끊김');
    assert.equal(online.got(sock, 'force_disconnect')[0]?.code, 'ACCOUNT_BANNED');
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'REPORT_RESOLVE', targetId: report.id })).length, 1);
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'BAN', targetId: report.target.uuid })).length, 1);
});

test('A14-B-227 기각 → DISMISSED, 정지 없음, 기록 REPORT_DISMISS', async (t) => {
    if (H.noDb(t)) return;
    const report = await addReport();
    const res = await ctx.app.agent.post(`/admin-api/reports/${report.id}/dismiss`, { memo: '문제 없음' });
    assert.equal(res.status, 200);
    assert.equal((await db.Report.findByPk(report.id, { raw: true })).status, 'DISMISSED');
    assert.equal(await db.UserBan.count({ where: { user_id: report.target.uuid } }), 0);
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'REPORT_DISMISS', targetId: report.id })).length, 1);
});

test('A14-B-228 두 관리자가 같은 신고를 동시에 처리·기각 → 하나만 됨, 다른 쪽 409 REPORT_ALREADY_HANDLED { handledBy, handledAt }', async (t) => {
    if (H.noDb(t)) return;
    const other = await adminTestApp({ t, admin: { loginId: `a14ops2${H.tag()}` } });
    const report = await addReport();
    const [a, b] = await Promise.all([
        ctx.app.agent.post(`/admin-api/reports/${report.id}/resolve`, resolveBody),
        other.agent.post(`/admin-api/reports/${report.id}/dismiss`, { memo: '동시' }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const lost = a.status === 409 ? a : b;
    const won = a.status === 409 ? 'other' : 'first';
    assert.equal(lost.body.code, 'REPORT_ALREADY_HANDLED');
    assert.ok(lost.body.handledBy, 'handledBy');
    assert.ok(lost.body.handledAt, 'handledAt');
    const row = await db.Report.findByPk(report.id, { raw: true });
    assert.equal(row.status, won === 'first' ? 'RESOLVED' : 'DISMISSED');
    assert.equal(await db.UserBan.count({ where: { user_id: report.target.uuid } }), won === 'first' ? 1 : 0);
});

test('A14-B-229 증거 저장 실패한 신고 → 상세 200, evidence null', async (t) => {
    if (H.noDb(t)) return;
    const report = await addReport();
    const res = await ctx.app.agent.get(`/admin-api/reports/${report.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.evidence, null);
});

test('A14-B-230 시험 시간대 한국 → 처리 handled_at이 지금 UTC와 1분 안 (9시간 어긋남 없음)', async (t) => {
    if (H.noDb(t)) return;
    const savedTz = process.env.TZ;
    process.env.TZ = 'Asia/Seoul';
    t.after(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; });
    const report = await addReport();
    assert.equal((await ctx.app.agent.post(`/admin-api/reports/${report.id}/dismiss`, {})).status, 200);
    const [row] = await db.sequelize.query(
        'SELECT TIMESTAMPDIFF(SECOND, handled_at, UTC_TIMESTAMP()) AS diff FROM reports WHERE id = :id',
        { replacements: { id: report.id }, type: db.Sequelize.QueryTypes.SELECT },
    );
    assert.ok(Math.abs(Number(row.diff)) < 60, `UTC와 차이 ${row.diff}초`);
});
