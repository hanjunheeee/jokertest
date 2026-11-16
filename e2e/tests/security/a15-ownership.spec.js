'use strict';

// 남의 것에 손대기 거절 브라우저 시험 (PC) — 로그인한 A 브라우저가 남의 판 결과·지갑·알림·문의·충전 주문·초대에 손대면 거절, 남의 것은 그대로
// 목록 A15-보안.md 번호 A15-E-018·066~070 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-ownership.spec.js)
const crypto = require('node:crypto');
const { test, expect, E2E, ui, internal, e2e } = require('../../helpers/fixtures');
const { api, login, db } = require('./_sec');
const { botApi } = require('../../helpers/friends');
const { sqlTime } = require('../../helpers/db');
const st = require('../store/store-tools');
const J = require('../room/_a01b-join-kit');
const k = require('./_a15-kit');

// A 브라우저 쿠키로 API (화면이 보내는 것과 같은 Origin)
async function callAs(person, method, pathname, data) {
    const res = await person.context.request.fetch(`${E2E.apiUrl}${pathname}`, { method, data, headers: { origin: E2E.desktopUrl } });
    return { status: res.status(), body: await res.json().catch(() => null) };
}

// 끝난 5명 판 기록 넣기 (판 줄 + 다섯 사람 참가 줄) → 판 id
async function seedEndedGame(people) {
    const id = crypto.randomUUID();
    const at = sqlTime();
    await db.query(
        'INSERT INTO game_results (id, started_at, ended_at, winner, win_reason, day_index, player_count, settings, completed) VALUES (?,?,?,?,?,?,?,?,?)',
        [id, at, at, 'CITIZEN', null, 2, people.length, JSON.stringify({ gameSource: { v: 1, value: 'production' } }), 1],
    );
    for (const [i, p] of people.entries()) {
        const role = i === 0 ? 'JOKER' : 'CITIZEN';
        await db.query(
            'INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, won, is_alive, death_reason) VALUES (?,?,?,?,?,?,?,?)',
            [id, p.uuid, p.nickname, role, role, role === 'CITIZEN' ? 1 : 0, 1, null],
        );
    }
    return id;
}

test('A15-E-018 판에 없던 사람이 끝난 5명 판 id로 브라우저 요청 GET /game/:gameId → 404 @smoke', async ({ user, accounts }) => {
    const people = await accounts.createMany(5);
    const gameId = await seedEndedGame(people);
    try {
        const mine = await callAs(user, 'GET', `/game/${gameId}`);
        expect(mine.status).toBe(404);
        expect(JSON.stringify(mine.body)).not.toContain(people[0].uuid);
        // 그 판 사람은 200 (404가 기록을 잘못 넣은 탓이 아님)
        const { cookie } = await login(people[1]);
        expect((await api('GET', `/game/${gameId}`, { cookie })).status).toBe(200);
    } finally {
        await db.query('DELETE FROM game_result_players WHERE game_id = ?', [gameId]);
        await db.query('DELETE FROM game_results WHERE id = ?', [gameId]);
    }
});

test('A15-E-066 A 브라우저가 GET /economy/accounts/<B>/wallet → 403', async ({ user, accounts }) => {
    const b = await accounts.create();
    const res = await callAs(user, 'GET', `/economy/accounts/${b.uuid}/wallet`);
    expect(res.status).toBe(403);
});

test('A15-E-067 B 알림 id로 A가 PATCH /notifications/:id/read → 404, B 알림 창에 그 알림 안 읽음 그대로', async ({ user, players }) => {
    const b = await players.add();
    const title = `a15 남의 알림 ${crypto.randomBytes(3).toString('hex')}`;
    await internal.announceTo([b.account.uuid], { title, body: '남의 알림 읽음 시험' });
    const listOf = async () => {
        const got = await callAs(b, 'GET', '/notifications');
        const data = got.body?.data;
        return Array.isArray(data) ? data : (data?.items ?? data?.notifications ?? []);
    };
    const mine = (await listOf()).find((x) => x.title === title);
    expect(mine, 'B 알림이 생김 (준비)').toBeTruthy();
    const res = await callAs(user, 'PATCH', `/notifications/${encodeURIComponent(mine.id)}/read`);
    expect(res.status).toBe(404);
    expect((await listOf()).find((x) => x.id === mine.id)?.readAt ?? null, 'B 알림 읽음 시각 그대로 없음').toBeNull();
    // B 화면: 알림 단추의 안 읽음 수 = 서버의 안 읽은 알림 수 (그 알림 포함) — 창을 열면 읽음 처리돼서 단추만 봄
    // 새 계정도 다른 알림(가입 때 받는 것 등)이 있을 수 있어 1개로 박지 않고 서버 수와 맞춤
    await ui.gotoLobby(b.page);
    await expect.poll(async () => {
        const unread = (await listOf()).filter((x) => !x.readAt);
        if (!unread.some((x) => x.id === mine.id)) return 'B 알림이 읽음으로 바뀜';
        const label = await b.page.getByRole('button', { name: /^알림( \(읽지 않음 \d+개\))?$/ }).getAttribute('aria-label').catch(() => null);
        return label === `알림 (읽지 않음 ${unread.length}개)` ? 'OK' : `단추 "${label}" / 서버 안 읽음 ${unread.length}개`;
    }, { timeout: 10_000, message: 'B 알림 단추 안 읽음 수' }).toBe('OK');
});

test('A15-E-068 B 문의 id로 A가 GET /inquiries/:id → 404', async ({ user, accounts }) => {
    const b = await accounts.create();
    const { cookie } = await login(b);
    const made = await api('POST', '/inquiries', { cookie, headers: { origin: E2E.desktopUrl }, body: { category: 'ETC', title: 'a15 남의 문의', body: '남의 문의 시험 본문' } });
    expect(made.status, 'B 문의 쓰기 (준비)').toBe(201);
    const res = await callAs(user, 'GET', `/inquiries/${made.json.inquiry.id}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('남의 문의 시험 본문');
});

test('A15-E-069 B 충전 주문 id로 A가 GET /economy/topup/orders/:orderId → 403 NOT_OWNER', async ({ user, accounts }) => {
    const b = await accounts.create();
    const order = await st.createTopupOrder(b.uuid);
    const res = await callAs(user, 'GET', `/economy/topup/orders/${encodeURIComponent(order.orderId)}`);
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('NOT_OWNER');
});

test('A15-E-070 봇 방장이 봇 B를 초대 → 사람 A의 페이지 소켓으로 그 초대 수락 → 거절, A는 대기방 안 감', async ({ user, bots }) => {
    test.setTimeout(150_000);
    const page = user.page;
    await k.hookPageSocket(page);
    await ui.gotoLobby(page);
    await k.expectSocketHooked(page);
    const { host, room } = await J.botRoom(bots, { max: 5, count: 1 });
    const [guest] = await bots.spawn(1);
    // 방장 봇과 봇 B 친구 맺기 (초대는 친구에게만)
    await botApi(host, 'POST', '/friends/requests', { receiverId: guest.account.uuid });
    let requestId = null;
    await expect.poll(async () => {
        const incoming = await botApi(guest, 'GET', '/friends/requests/incoming');
        requestId = incoming.find((r) => r.id === host.account.uuid)?.request_id ?? null;
        return requestId !== null;
    }, { timeout: 10_000 }).toBe(true);
    await botApi(guest, 'PUT', `/friends/requests/${requestId}/accept`);
    await J.botInvite(host, guest.account.uuid);
    const inviteId = await J.inviteIdFor(guest, host.account.uuid);
    const reply = await k.pageEmit(page, 'accept_game_invite', { inviteId });
    expect(reply?.timeout, '답을 받음').toBeUndefined();
    expect(reply?.ok).toBe(false);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(user.account.uuid)).toBeNull();
    expect((await e2e.roomOf(host.account.uuid))?.roomId).toBe(room.roomId);
    expect(await J.roomSize(host.account.uuid)).toBe(1);
});
