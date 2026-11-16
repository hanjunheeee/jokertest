'use strict';

// 관리자 제재 시험: 강제 접속 종료·기간 정지·날짜 경계·기간 끝·영구·이미 정지·기간 바꾸기·해제·사유 빔·사유 길이·할 수 없는 대상 (시험 DB + 가짜 소켓 + 진짜 플레이어 로그인)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-204~220·281~282 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a14-ops-helpers');

const { db } = H;
const ctx = H.useAdminFile();
const DAY = 24 * 60 * 60 * 1000;

const path = (uuid) => `/admin-api/members/${uuid}`;
const ban = (uuid, body) => ctx.app.agent.post(`${path(uuid)}/bans`, body);
const unban = (uuid, reason) => ctx.app.agent.post(`${path(uuid)}/unban`, { reason });
const kick = (uuid, reason) => ctx.app.agent.post(`${path(uuid)}/force-disconnect`, { reason });
const bansOf = (uuid) => db.UserBan.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });
const week = { kind: 'PERIOD', days: 7, reason: '욕설' };

// 플레이어 로그인을 시계를 옮겨서 해 봄 (Date만 가짜, 나머지 타이머는 진짜)
async function loginAt(t, email, atMs) {
    t.mock.timers.enable({ apis: ['Date'], now: atMs });
    try {
        return await H.playerLogin(email);
    } finally {
        t.mock.timers.reset();
    }
}

test('A14-B-204 접속 중 회원 강제 종료 → 소켓 force_disconnect ADMIN_DISCONNECT 뒤 끊김, 다시 로그인 됨, 기록 FORCE_DISCONNECT', async (t) => {
    if (H.noDb(t)) return;
    const online = H.fakeOnline(t);
    const member = await H.createPlayer('s204', { withPassword: true });
    const sock = online.connect(member.uuid);
    const res = await kick(member.uuid, '도배');
    assert.equal(res.status, 200);
    assert.equal(online.got(sock, 'force_disconnect')[0]?.code, 'ADMIN_DISCONNECT');
    assert.equal(sock.connected, false);
    assert.deepEqual(await H.playerLogin(member.email), { ok: true });
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'FORCE_DISCONNECT', targetId: member.uuid })).length, 1);
});

test('A14-B-205 접속 중 회원 7일 정지 → user_bans(banned_by·reason·end_at 지금+7일), 소켓 ACCOUNT_BANNED로 끊김, 플레이어 로그인 403, 기록 BAN', async (t) => {
    if (H.noDb(t)) return;
    const online = H.fakeOnline(t);
    const member = await H.createPlayer('s205', { withPassword: true });
    const sock = online.connect(member.uuid);
    const sentAt = Date.now();
    const res = await ban(member.uuid, week);
    assert.equal(res.status, 201);
    const [row] = await bansOf(member.uuid);
    assert.equal(row.banned_by, ctx.app.admin.id);
    assert.equal(row.reason, '욕설');
    const endAt = new Date(row.end_at).getTime();
    assert.ok(Math.abs(endAt - (sentAt + 7 * DAY)) < 60_000, `end_at ${row.end_at}`);
    assert.equal(online.got(sock, 'force_disconnect')[0]?.code, 'ACCOUNT_BANNED');
    assert.equal(sock.connected, false);
    const login = await H.playerLogin(member.email);
    assert.equal(login.ok, false);
    assert.equal(login.status, 403);
    const [audit] = await H.myAudits(ctx.app.admin, { action: 'BAN', targetId: member.uuid });
    assert.ok(audit, '기록 BAN');
    assert.equal(audit.after_value.ban.id, row.id);
    assert.equal(audit.reason, '욕설');
});

// A14-B-206~209 정지 날짜 경계 (값 4)
const DAY_EDGES = [
    ['206', 0, 400],
    ['207', 1, 201],
    ['208', 3650, 201],
    ['209', 3651, 400],
];
for (const [no, days, status] of DAY_EDGES) {
    test(`A14-B-${no} 정지 days ${days} → ${status}`, async (t) => {
        if (H.noDb(t)) return;
        const member = await H.createPlayer(`s${no}`);
        const res = await ban(member.uuid, { kind: 'PERIOD', days, reason: '경계' });
        assert.equal(res.status, status, `상태 ${res.status} ${res.body?.code}`);
        assert.equal((await bansOf(member.uuid)).length, status === 201 ? 1 : 0);
    });
}

test('A14-B-210 1일 정지 → 시계 1일 + 1초 뒤 플레이어 로그인 됨', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s210', { withPassword: true });
    const sentAt = Date.now();
    assert.equal((await ban(member.uuid, { kind: 'PERIOD', days: 1, reason: '하루' })).status, 201);
    const endAt = new Date((await bansOf(member.uuid))[0].end_at).getTime();
    assert.ok(endAt <= sentAt + DAY + 60_000);
    assert.deepEqual(await loginAt(t, member.email, endAt + 1000), { ok: true });
});

test('A14-B-211 영구 정지 → is_permanent 1, 10년 뒤 시계에도 로그인 403', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s211', { withPassword: true });
    assert.equal((await ban(member.uuid, { kind: 'PERMANENT', reason: '영구' })).status, 201);
    const [row] = await bansOf(member.uuid);
    assert.equal(Boolean(row.is_permanent), true);
    const later = await loginAt(t, member.email, Date.now() + 3650 * DAY);
    assert.equal(later.ok, false);
    assert.equal(later.status, 403);
});

// A14-B-212~213 이미 정지 중 (값 2)
test('A14-B-212 정지 중에 또 정지 → 409 ALREADY_BANNED { banId }, 정지 줄 1개 그대로', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s212');
    assert.equal((await ban(member.uuid, week)).status, 201);
    const [first] = await bansOf(member.uuid);
    const res = await ban(member.uuid, { kind: 'PERIOD', days: 30, reason: '또' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ALREADY_BANNED');
    assert.equal(res.body.banId, first.id);
    assert.equal((await bansOf(member.uuid)).length, 1);
});

test('A14-B-213 기간 바꾸기 PATCH → end_at·is_permanent 바뀜, 기록 BAN_UPDATE', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s213');
    assert.equal((await ban(member.uuid, week)).status, 201);
    const [before] = await bansOf(member.uuid);
    const res = await ctx.app.agent.request('PATCH', `${path(member.uuid)}/bans/${before.id}`, { body: { kind: 'PERMANENT', reason: '영구로' } });
    assert.equal(res.status, 200);
    const [after] = await bansOf(member.uuid);
    assert.equal(Boolean(after.is_permanent), true);
    assert.equal(after.end_at, null);
    assert.notEqual(String(after.end_at), String(before.end_at));
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'BAN_UPDATE', targetId: member.uuid })).length, 1);
});

test('A14-B-214 해제(사유) → end_at 지금·lifted_at·lifted_by·lift_reason, 줄 안 지움, 바로 로그인 됨, 기록 UNBAN 사유', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s214', { withPassword: true });
    assert.equal((await ban(member.uuid, week)).status, 201);
    const sentAt = Date.now();
    const res = await unban(member.uuid, '오해였음');
    assert.equal(res.status, 200);
    const rows = await bansOf(member.uuid);
    assert.equal(rows.length, 1, '줄 안 지움');
    const [row] = rows;
    assert.ok(Math.abs(new Date(row.end_at).getTime() - sentAt) < 60_000, `end_at ${row.end_at}`);
    assert.ok(row.lifted_at, 'lifted_at');
    assert.equal(row.lifted_by, ctx.app.admin.id);
    assert.equal(row.lift_reason, '오해였음');
    assert.deepEqual(await H.playerLogin(member.email), { ok: true });
    const [audit] = await H.myAudits(ctx.app.admin, { action: 'UNBAN', targetId: member.uuid });
    assert.equal(audit?.reason, '오해였음');
});

// A14-B-215~217 사유 빔 (값 3): 빈 글·공백만 둘 다
const EMPTY_REASON = [
    ['215', '정지', async (uuid) => ban(uuid, { kind: 'PERIOD', days: 7, reason: '' }), async (uuid) => ban(uuid, { kind: 'PERIOD', days: 7, reason: '   ' })],
    ['216', '해제', async (uuid) => unban(uuid, ''), async (uuid) => unban(uuid, '   ')],
    ['217', '강제 종료', async (uuid) => kick(uuid, ''), async (uuid) => kick(uuid, '   ')],
];
for (const [no, label, sendEmpty, sendSpaces] of EMPTY_REASON) {
    test(`A14-B-${no} ${label} 사유 "" 또는 공백만 → 400 REASON_REQUIRED, 표 그대로`, async (t) => {
        if (H.noDb(t)) return;
        const member = await H.createPlayer(`s${no}`);
        // 해제는 걸린 정지가 있어야 "그대로"를 볼 수 있음
        if (no === '216') assert.equal((await ban(member.uuid, week)).status, 201);
        const bansBefore = await bansOf(member.uuid);
        const auditsBefore = (await H.myAudits(ctx.app.admin, { targetId: member.uuid })).length;
        for (const send of [sendEmpty, sendSpaces]) {
            const res = await send(member.uuid);
            assert.equal(res.status, 400);
            assert.equal(res.body.code, 'REASON_REQUIRED');
        }
        assert.deepEqual(await bansOf(member.uuid), bansBefore);
        assert.equal((await H.myAudits(ctx.app.admin, { targetId: member.uuid })).length, auditsBefore);
    });
}

test('A14-B-218 정지 사유 201자 → 400, 200자 → 201', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s218');
    const long = await ban(member.uuid, { kind: 'PERIOD', days: 7, reason: '가'.repeat(201) });
    assert.equal(long.status, 400);
    assert.equal((await bansOf(member.uuid)).length, 0);
    const fit = await ban(member.uuid, { kind: 'PERIOD', days: 7, reason: '가'.repeat(200) });
    assert.equal(fit.status, 201);
});

// A14-B-219~220 할 수 없는 대상 (값 2)
test('A14-B-219 정지 아닌 사람 해제 → 409 NOT_BANNED', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s219');
    const res = await unban(member.uuid, '풀기');
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NOT_BANNED');
});

test('A14-B-220 탈퇴 회원 정지 → 409 MEMBER_WITHDRAWN, 정지 줄 없음', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s220');
    await H.withdraw(member.uuid);
    const res = await ban(member.uuid, week);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'MEMBER_WITHDRAWN');
    assert.equal((await bansOf(member.uuid)).length, 0);
});

// 정지 답의 시각 = 저장된 시각인지 (DB 칸은 초까지라 답에 밀리초가 붙으면 새로고침 때 최대 1초 달라 보임)
// 시계를 "어떤 초 + 0.6초"로 고정 → 반올림이면 저장 값이 다음 초로 넘어가 어긋남이 늘 보임
const iso = (value) => (value ? new Date(value).toISOString() : null);
async function atSixTenths(t, run) {
    t.mock.timers.enable({ apis: ['Date'], now: Math.floor(Date.now() / 1000) * 1000 + 600 });
    try {
        return await run();
    } finally {
        t.mock.timers.reset();
    }
}

test('A14-B-281 정지 넣기 답의 startAt·endAt = DB에 저장된 값 (밀리초 없음, 시계 x.600초에도)', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s281');
    const res = await atSixTenths(t, () => ban(member.uuid, week));
    assert.equal(res.status, 201);
    const [row] = await bansOf(member.uuid);
    assert.equal(res.body.ban.endAt, iso(row.end_at));
    assert.equal(res.body.ban.startAt, iso(row.start_at));
});

test('A14-B-282 기간 바꾸기 답의 endAt = DB에 저장된 값 (밀리초 없음, 시계 x.600초에도)', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('s282');
    assert.equal((await ban(member.uuid, week)).status, 201);
    const [before] = await bansOf(member.uuid);
    const res = await atSixTenths(t, () => ctx.app.agent.request('PATCH', `${path(member.uuid)}/bans/${before.id}`, { body: { kind: 'PERIOD', days: 3, reason: '3일로' } }));
    assert.equal(res.status, 200);
    const [after] = await bansOf(member.uuid);
    assert.equal(res.body.ban.endAt, iso(after.end_at));
});
