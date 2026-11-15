'use strict';

// 관리자 회원 찾기·상세 시험: 찾기 세 길·부분 이메일·가린 값·없음·탈퇴·상세 칸·탈주 칸·죽은 서버 접속 줄·이메일 보기·회원 전적 (시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-191~203 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const H = require('./a14-ops-helpers');
const emitter = require('../../socket/emitter');

const { db } = H;
const ctx = H.useAdminFile();

const search = (q) => ctx.app.agent.get(`/admin-api/members?q=${encodeURIComponent(q)}`);
const detail = (uuid) => ctx.app.agent.get(`/admin-api/members/${uuid}`);

// 찾기 세 길 + 1자 거절 (값 4): 시험마다 앞 2자가 드문 닉네임 묶음을 만듦
test('A14-B-191 UUID 그대로 찾기 → 그 회원 1명', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m191');
    const res = await search(member.uuid);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((i) => i.uuid), [member.uuid]);
});

test('A14-B-192 닉네임 앞 2자 → 앞이 같은 회원들', async (t) => {
    if (H.noDb(t)) return;
    const head = `뷁${String.fromCharCode(0xAC00 + crypto.randomInt(0, 11000))}`;
    const same = [await H.createPlayer('x', { nickname: `${head}가${H.tag()}` }), await H.createPlayer('x', { nickname: `${head}나${H.tag()}` })];
    await H.createPlayer('x', { nickname: `쀍${head}${H.tag()}` });
    const res = await search(head);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((i) => i.uuid).sort(), same.map((m) => m.uuid).sort());
});

test('A14-B-193 닉네임 1자 → 400 INVALID_INPUT field q', async (t) => {
    if (H.noDb(t)) return;
    H.assertInvalid(await search('뷁'), 'q');
});

test('A14-B-194 이메일 전체 → 그 회원 1명', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m194');
    const res = await search(member.email);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((i) => i.uuid), [member.uuid]);
});

test('A14-B-195 이메일 일부 "@gmail.com" → 빈 목록', async (t) => {
    if (H.noDb(t)) return;
    await H.createPlayer('m195', { email: `m195-${H.tag()}@gmail.com` });
    const res = await search('@gmail.com');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items, []);
});

test('A14-B-196 찾기 결과엔 emailMasked만, 이메일 원문·비번 해시·토큰 칸 없음', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m196');
    const res = await search(member.uuid);
    const [item] = res.body.items;
    assert.ok(item.emailMasked, 'emailMasked 있음');
    for (const key of Object.keys(item)) {
        assert.equal(/^(email|password|passwordHash|password_hash|token|refreshToken)$/i.test(key), false, `숨길 칸 ${key}`);
    }
    assert.equal(JSON.stringify(res.body).includes(member.email), false, '이메일 원문 안 보임');
    assert.equal(JSON.stringify(res.body).includes('not-a-real-hash'), false, '비번 해시 안 보임');
});

// A14-B-197~198 없음·탈퇴함 (값 2)
test('A14-B-197 없는 UUID 상세 → 404 MEMBER_NOT_FOUND', async (t) => {
    if (H.noDb(t)) return;
    const res = await detail(crypto.randomUUID());
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'MEMBER_NOT_FOUND');
});

test('A14-B-198 탈퇴 회원 상세 → withdrawn true, 접속 중 아님 (접속 목록에 남아 있어도)', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m198');
    await H.withdraw(member.uuid);
    emitter.onlineUsers.set(member.uuid, 'a14ops-sock-198');
    t.after(() => emitter.onlineUsers.delete(member.uuid));
    const res = await detail(member.uuid);
    assert.equal(res.status, 200);
    assert.equal(res.body.member.withdrawn, true);
    assert.equal(res.body.member.online, false);
});

test('A14-B-199 정지 2번(하나는 해제)·받은 신고 1·로그인 3번 → 가입일·상태·bans(해제 사유·해제한 관리자·active)·reportsReceived·logins(IP 가림)', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m199');
    const path = `/admin-api/members/${member.uuid}`;
    assert.equal((await ctx.app.agent.post(`${path}/bans`, { kind: 'PERIOD', days: 7, reason: '첫 정지' })).status, 201);
    assert.equal((await ctx.app.agent.post(`${path}/unban`, { reason: '오해였음' })).status, 200);
    assert.equal((await ctx.app.agent.post(`${path}/bans`, { kind: 'PERIOD', days: 3, reason: '둘째 정지' })).status, 201);
    const reporter = await H.createPlayer('m199r');
    await db.Report.create({ reporter_id: reporter.uuid, target_id: member.uuid, game_id: crypto.randomUUID(), reason_code: 'ABUSE' });
    for (let i = 0; i < 3; i += 1) {
        await db.LoginHistory.create({ user_id: member.uuid, ip_address: `123.45.67.${80 + i}`, success: true });
    }
    const res = await detail(member.uuid);
    assert.equal(res.status, 200);
    const { member: info, bans, reportsReceived, logins } = res.body;
    assert.ok(info.createdAt, '가입일');
    assert.equal(info.status, 'ACTIVE');
    assert.equal(bans.length, 2);
    const lifted = bans.find((b) => b.reason === '첫 정지');
    const current = bans.find((b) => b.reason === '둘째 정지');
    assert.equal(lifted.liftReason, '오해였음');
    assert.equal(lifted.liftedByLoginId, ctx.app.admin.loginId);
    assert.equal(lifted.active, false);
    assert.equal(current.active, true);
    assert.equal(reportsReceived.length, 1);
    assert.equal(logins.length, 3);
    for (const login of logins) assert.equal(login.ipMasked, '123.45.*.*');
    assert.equal(JSON.stringify(res.body).includes('123.45.67.8'), false, 'IP 원문 안 보임');
});

test('A14-B-200 탈주 1줄(막힘 중) 회원 상세 → desertions 1개, reason·desertedAt·blockedUntil·active true', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m200');
    const now = Date.now();
    const gameId = crypto.randomUUID();
    await db.GameDesertion.create({
        user_id: member.uuid, game_id: gameId, reason: 'DISCONNECT_TIMEOUT', deserted_at: new Date(now - 60_000), blocked_until: new Date(now + 30 * 60_000),
    });
    const res = await detail(member.uuid);
    assert.equal(res.status, 200);
    assert.equal(res.body.desertions.length, 1);
    const [row] = res.body.desertions;
    assert.equal(row.gameId, gameId);
    assert.equal(row.reason, 'DISCONNECT_TIMEOUT');
    assert.ok(row.desertedAt && row.blockedUntil, '시각 칸');
    assert.equal(row.active, true);
});

test('A14-B-201 online_presence ONLINE 줄 + 그 서버 죽음 → online false (살아 있는 서버 줄은 true)', async (t) => {
    if (H.noDb(t)) return;
    const { otherId } = await H.startTwoNodes(t);
    const dead = await H.createPlayer('m201d');
    const alive = await H.createPlayer('m201a');
    await db.OnlinePresence.create({ user_id: dead.uuid, status: 'ONLINE', server_id: `a14ops-dead-${H.tag()}` });
    await db.OnlinePresence.create({ user_id: alive.uuid, status: 'ONLINE', server_id: otherId });
    const deadRes = await detail(dead.uuid);
    assert.equal(deadRes.status, 200);
    assert.equal(deadRes.body.member.online, false);
    const aliveRes = await detail(alive.uuid);
    assert.equal(aliveRes.body.member.online, true, '견줌: 살아 있는 서버 줄은 접속 중');
});

test('A14-B-202 POST reveal-email → 이메일 전체 + 기록 VIEW_PII', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('m202');
    const res = await ctx.app.agent.post(`/admin-api/members/${member.uuid}/reveal-email`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.email, member.email);
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'VIEW_PII', targetId: member.uuid })).length, 1);
});

test('A14-B-203 6명 판 둘 저장 → GET /games?userUuid= 판 2개, 상세 참가자 6명 직업·승패·시간', async (t) => {
    if (H.noDb(t)) return;
    const players = [];
    for (let i = 0; i < 6; i += 1) players.push(await H.createPlayer(`g203${i}`));
    const roles = ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
    const gameIds = [crypto.randomUUID(), crypto.randomUUID()];
    const base = Date.now() - 3_600_000;
    for (const [g, gameId] of gameIds.entries()) {
        const startedAt = base + g * 900_000;
        await db.GameResult.create({
            id: gameId, started_at: new Date(startedAt), ended_at: new Date(startedAt + 600_000), winner: 'CITIZEN',
            win_reason: 'JOKER_EXECUTED', day_index: 2, player_count: 6,
        });
        await db.GameResultPlayer.bulkCreate(players.map((p, i) => ({
            game_id: gameId, user_id: p.uuid, nickname_snapshot: p.nickname, role: roles[i],
            team: roles[i] === 'JOKER' ? 'JOKER' : 'CITIZEN', won: roles[i] !== 'JOKER', is_alive: i !== 0, death_reason: i === 0 ? 'EXECUTION' : null,
        })));
    }
    const list = await ctx.app.agent.get(`/admin-api/games?userUuid=${players[2].uuid}`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items.map((g) => g.gameId).sort(), [...gameIds].sort());
    const one = await ctx.app.agent.get(`/admin-api/games/${gameIds[0]}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.players.length, 6);
    const joker = one.body.players.find((p) => p.uuid === players[0].uuid);
    assert.equal(joker.role, 'JOKER');
    assert.equal(joker.won, false);
    assert.equal(one.body.players.find((p) => p.uuid === players[1].uuid).role, 'DOCTOR');
    assert.equal(one.body.game.durationSec, 600);
});
