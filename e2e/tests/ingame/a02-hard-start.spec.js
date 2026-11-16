'use strict';

// 여러 사람이 얽힌 판 시작 브라우저 시험 (PC, 어려움) — 화면으로만 시작·10명 사람 방장·PC와 폰 같은 판·10초 같이 낮·탭 닫음·끊긴 채 시작·시작과 준비 풀기 겹침·죽은 사람 다음 판
// 목록 A02-판시작-역할.md 번호 A02-H-013~020 (역할 확인 10초를 보는 것은 손잡이 없이 진짜 시간, 나머지 앞 단계는 손잡이)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { sleep } = require('../../helpers/wait');
const { ROLE_LABELS, joinRoomByCodeUi, readyUi, gotoLobby } = require('../../helpers/ui');
const { createRoomUi, hostGame, botsJoinAndReady, expectPartyCount } = require('../room/roomHelpers');
const N = require('./b-night/_night');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const blockedDialog = (page) => page.getByRole('dialog', { name: '게임 시작 불가' });
const U = (x) => x.account.uuid;
// 역할 확인 10초 (결정 "확인 10초"), 허용 폭 ±1.5초
const REVEAL_MS = 10_000;
const SLACK_MS = 1_500;
// 시작 때 한 명이라도 끊겨 있으면 거절 글 (서버 startLaunch.js 글)
const UNAVAILABLE_TEXT = '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.';

async function openHumans(players, n, o = {}) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add(o));
    return out;
}

function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

// 역할 창 열린 채로 받기 — 안 떠 있으면 위 "내 역할 보기"로 엶 (안내 창이 막으면 닫으면서)
async function openReveal(page) {
    const dialog = revealDialog(page);
    await expect(async () => {
        if (await dialog.isVisible().catch(() => false)) return;
        await N.closeNotices(page);
        await N.closeDawnReport(page);
        await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    return dialog;
}

// 한 사람 창의 동료 줄: 같은 직업 상대가 있으면 "동료 ○○" + 그 닉네임들만, 없으면 "동료" 글 없음 (상대는 서버 판 값에서)
async function expectAllies(page, s, uuid) {
    const me = s.players.find((p) => p.uuid === uuid);
    const label = ROLE_LABELS[me.role];
    const mates = me.role === 'CITIZEN' ? [] : s.players.filter((p) => p.uuid !== uuid && p.role === me.role).map((p) => p.nickname);
    const dialog = await openReveal(page);
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    if (mates.length === 0) await expect(dialog).not.toContainText('동료');
    else {
        await expect(dialog.getByText(`동료 ${label}`, { exact: true })).toBeVisible();
        await expect(dialog.getByRole('listitem')).toHaveText(mates);
    }
}

// 역할 창 확인 눌러 닫고 "낮이 되었습니다"가 뜰 때까지 0.1초마다 봄 → 기준 시각부터 걸린 ms (확인 눌러도 안 당겨짐)
async function msUntilDay(page, fromMs) {
    const dialog = revealDialog(page);
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click();
    await expect.poll(() => page.getByText('낮이 되었습니다').first().isVisible().catch(() => false), {
        timeout: REVEAL_MS + 10_000, intervals: [100],
    }).toBe(true);
    return Date.now() - fromMs;
}

function expectAboutTen(ms, who) {
    expect(ms, `${who} 낮까지`).toBeGreaterThanOrEqual(REVEAL_MS - SLACK_MS);
    expect(ms, `${who} 낮까지`).toBeLessThanOrEqual(REVEAL_MS + SLACK_MS);
}

// 방장 봇이 시작 알림(game_started)을 받은 시각
async function startedAt(t) {
    await t.bots[0].waitForEvent('game_started');
    return t.bots[0].events.find((r) => r.event === 'game_started').at;
}

// 죽은 사람: 연출 창 닫으며 "사망 후 선택" 창 기다림 → 게임 나가기 → 판 화면 벗어남 → 로비
async function leaveAsDead(page) {
    const dead = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await N.closeNotices(page);
        await N.closeDawnReport(page);
        await expect(dead).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 45_000 });
    // 나가기 확인은 브라우저 확인 창(window.confirm)으로 물을 수 있음 → 뜨면 "확인"
    const accept = (d) => { d.accept().catch(() => {}); };
    page.once('dialog', accept);
    await dead.getByRole('button', { name: '게임 나가기' }).click();
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
    page.off('dialog', accept);
    await gotoLobby(page);
}

test('A02-H-013 사람 5명이 화면으로만 방 만들기·코드 입장·준비·시작 → 5명 모두 역할 창, 10초에 다 같이 낮 @game @hard @realtime @smoke', async ({ players }) => {
    test.setTimeout(240_000);
    const people = await openHumans(players, 5);
    const [host, ...guests] = people;
    const room = await createRoomUi(host, { jokers: 1 });
    for (const g of guests) await joinRoomByCodeUi(g.page, room.roomCode);
    await expectPartyCount(host.page, 5);
    const wanted = Object.fromEntries(people.map((h, i) => [U(h), i === 0 ? 'JOKER' : 'CITIZEN']));
    await e2e.setRoles(wanted, { roomId: room.roomId });
    for (const g of guests) {
        await readyUi(g.page);
        await expect(g.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    await readyUi(host.page);
    await expect(host.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    const clickedAt = Date.now();
    await host.page.getByRole('button', { name: '게임시작' }).click();

    const dayMs = await Promise.all(people.map(async (h) => {
        await expect(h.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
        const dialog = revealDialog(h.page);
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await expect(dialog.getByText(h.account.nickname, { exact: true })).toBeVisible();
        return msUntilDay(h.page, clickedAt);
    }));
    expectRoles(await e2e.gameOf(U(host)), wanted);
    dayMs.forEach((ms, i) => expectAboutTen(ms, `사람 ${i + 1}`));
});

test('A02-H-014 사람 5 + 봇 5 = 10명, 사람 방장 화면으로 시작 → 사람 5명 역할 창, 동료 맞음 @game @hard', async ({ players, bots }) => {
    test.setTimeout(300_000);
    const people = await openHumans(players, 5);
    const roles = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'];
    const wanted = Object.fromEntries(people.map((h, i) => [U(h), roles[i]]));
    const botList = await bots.spawn(5);
    const t = await hostGame({
        host: people[0], guests: people.slice(1), botList, roles: wanted,
        settings: { custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } },
    });
    const s = await t.state();
    expect(s.players, '10명 판').toHaveLength(10);
    expectRoles(s, wanted);
    for (const h of people) await expectAllies(h.page, s, U(h));
});

test('A02-H-015 PC 사람 1 + 폰 크기 사람 1 + 봇 6 = 8명, 둘이 경비원 → 두 화면 모두 서로 동료 @game @hard', async ({ players, table }) => {
    test.setTimeout(240_000);
    const pc = await players.add();
    const phone = await players.add({ mobile: true });
    const wanted = { [U(pc)]: 'GUARD', [U(phone)]: 'GUARD' };
    const t = await table.setup({ humans: [pc, phone], bots: 6, settings: customRoleSettings({ JOKER: 1, GUARD: 2 }), roles: wanted });
    const s = await t.state();
    expectRoles(s, wanted);
    for (const [me, mate] of [[pc, phone], [phone, pc]]) {
        const dialog = await openReveal(me.page);
        await expectReadable(dialog.getByText('동료 경비원', { exact: true }));
        await expect(dialog.getByRole('listitem')).toHaveText([mate.account.nickname]);
    }
});

test('A02-H-016 사람 3 + 봇 3 = 6명 → 세 화면 10초(±1.5초)에 같이 낮 @game @hard @realtime', async ({ players, table }) => {
    test.setTimeout(180_000);
    const people = await openHumans(players, 3);
    const wanted = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({ humans: people, bots: 3, roles: wanted });
    const from = await startedAt(t);
    const dayMs = await Promise.all(people.map((h) => msUntilDay(h.page, from)));
    dayMs.forEach((ms, i) => expectAboutTen(ms, `사람 ${i + 1}`));
    expectRoles(await t.state(), wanted);
});

test('A02-H-017 사람 2 + 봇 3 = 5명, 역할 확인 4초에 A 탭 닫음 → B 화면 10초에 낮 그대로 @game @hard @realtime', async ({ players, table }) => {
    test.setTimeout(180_000);
    const [a, b] = await openHumans(players, 2);
    const wanted = { [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' };
    const t = await table.setup({ humans: [a, b], bots: 3, roles: wanted });
    const from = await startedAt(t);
    expectRoles(await t.state(), wanted);
    // 4초 시각까지는 진짜로 기다림 (규칙을 보는 시험이라 손잡이 안 씀)
    const left = from + 4_000 - Date.now();
    if (left < 0) throw new Error(`시작 4초 시각을 이미 지남 (${-left}ms 늦음) — 판 차리기가 느렸음`);
    await sleep(left);
    await a.page.close();
    expectAboutTen(await msUntilDay(b.page, from), 'B');
});

test('A02-H-018 사람 2 + 봇 4 = 6명, B 끊긴 채 A 방장 시작 → 거절 글, B 다시 붙은 뒤 시작 됨 @game @hard', async ({ players, bots }) => {
    test.setTimeout(240_000);
    const [a, b] = await openHumans(players, 2);
    const room = await createRoomUi(a, { jokers: 1 });
    await joinRoomByCodeUi(b.page, room.roomCode);
    await readyUi(b.page);
    await expect(b.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await botsJoinAndReady(await bots.spawn(4), U(a), room.roomCode);
    await e2e.setRoles({ [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }, { roomId: room.roomId });
    await expectPartyCount(a.page, 6);
    await readyUi(a.page);
    await expect(a.page.getByRole('button', { name: '준비취소' })).toBeVisible();

    // B 탭 닫음 = 연결 끊김 (대기방은 15초 동안 자리 남김)
    const bContext = b.page.context();
    await b.page.close();
    await a.page.getByRole('button', { name: '게임시작' }).click();
    const blocked = blockedDialog(a.page);
    await expect(blocked).toBeVisible();
    await expect(blocked.getByRole('alert')).toHaveText(UNAVAILABLE_TEXT);
    await expectReadable(blocked.getByRole('alert'));
    await expect(a.page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(U(a)), '판 안 생김').toBeNull();

    // B 다시 붙음 (15초 안, 로비를 거치면 방에서 빠져서 대기방 주소로 바로)
    const back = await bContext.newPage();
    await back.goto('/game-matching');
    const bReady = back.getByRole('button', { name: '준비취소' });
    const bNotReady = back.getByRole('button', { name: '준비완료' });
    await expect(bReady.or(bNotReady)).toBeVisible({ timeout: 15_000 });
    if (await bNotReady.isVisible().catch(() => false)) await bNotReady.click();
    await expect(bReady).toBeVisible();

    await blocked.getByRole('button', { name: '확인' }).click();
    await expect(blocked).toHaveCount(0);
    await a.page.getByRole('button', { name: '게임시작' }).click();
    await expect(a.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(back).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const g = await e2e.gameOf(U(a));
    expect(g?.players?.length, '6명 판').toBe(6);
});

test('A02-H-019 사람 2 + 봇 3 = 5명, A 시작과 B 준비 풀기를 같은 때 → 판 하나 또는 거절 하나, 두 화면 상태 같음 @game @hard', async ({ players, bots }) => {
    test.setTimeout(180_000);
    const [a, b] = await openHumans(players, 2);
    const room = await createRoomUi(a, { jokers: 1 });
    await joinRoomByCodeUi(b.page, room.roomCode);
    await readyUi(b.page);
    await expect(b.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await botsJoinAndReady(await bots.spawn(3), U(a), room.roomCode);
    await e2e.setRoles({ [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }, { roomId: room.roomId });
    await expectPartyCount(a.page, 5);
    await readyUi(a.page);
    await expect(a.page.getByRole('button', { name: '준비취소' })).toBeVisible();

    // 같은 때 누름
    await Promise.all([
        a.page.getByRole('button', { name: '게임시작' }).click(),
        b.page.getByRole('button', { name: '준비취소' }).click(),
    ]);

    // A 쪽 결과가 날 때까지: 판 화면 또는 거절 창
    let outcome = 'wait';
    await expect.poll(async () => {
        if (/\/ingame/.test(a.page.url())) outcome = 'started';
        else if (await blockedDialog(a.page).isVisible().catch(() => false)) outcome = 'blocked';
        return outcome;
    }, { timeout: 20_000 }).not.toBe('wait');

    if (outcome === 'started') {
        // 판 하나에 둘 다
        await expect(b.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
        const ga = await e2e.gameOf(U(a));
        const gb = await e2e.gameOf(U(b));
        expect(ga?.gameId).toBeTruthy();
        expect(gb?.gameId, '같은 판').toBe(ga.gameId);
    } else {
        // 거절: 판 없음, 둘 다 대기방, B는 준비 풀림 (A 화면·B 화면·서버가 같은 값)
        expect(await e2e.gameOf(U(a))).toBeNull();
        expect(await e2e.gameOf(U(b))).toBeNull();
        await expect(a.page).toHaveURL(/\/game-matching/);
        await expect(b.page).toHaveURL(/\/game-matching/);
        await expect(b.page.getByRole('button', { name: '준비완료' })).toBeVisible();
        const live = await e2e.roomOf(U(a));
        expect(live.players.find((p) => p.uuid === U(b))?.isReady, '서버: B 준비 풀림').toBe(false);
    }
});

test('A02-H-020 사람 2 + 봇 5 = 7명 판에서 A 죽음 → A 로비로 → B 방장 새 5명 방에 A 들어가 시작 → A 역할 창, 옛 판에 A 빠짐 @game @hard', async ({ players, table, bots }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const wanted = { [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' };
    const t = await table.setup({ humans: [a, b], bots: 5, roles: wanted });
    const oldGameId = t.gameId;
    const s = await t.state();
    expectRoles(s, wanted);
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    expect(jokerUuid, '광대 봇').toBeTruthy();
    for (const h of [a, b]) await N.closeRoleReveal(h.page);

    // 봇 표로 A 처형 (봇 5 > 기권 2), 밤엔 광대 봇이 B를 죽임 → 사람 둘 다 죽은 사람
    t.playBots((bot) => ({ dayVote: U(a), tribunal: 'GUILTY', night: U(bot) === jokerUuid ? U(b) : 'skip' }));
    await N.advanceUntilSettled(t, (g) => g.players.find((p) => p.uuid === U(a))?.alive === false);

    // A: 사망 후 선택 → 게임 나가기 → 로비
    await leaveAsDead(a.page);

    await N.advanceUntilSettled(t, (g) => g.players.find((p) => p.uuid === U(b))?.alive === false);
    await t.stopBots();
    await leaveAsDead(b.page);

    // 옛 판은 아직 도는 중, A는 그 판에서 빠짐
    const old = await e2e.game(oldGameId);
    expect(old?.phase, '옛 판 아직 진행').not.toBe('ENDED');
    expect(old.players.find((p) => p.uuid === U(a))?.isParticipating ?? false, '옛 판에 A 참여 아님').toBe(false);

    // B 방장 새 5명 방 (B·A + 새 봇 3)
    const room = await createRoomUi(b, { jokers: 1 });
    await joinRoomByCodeUi(a.page, room.roomCode);
    await readyUi(a.page);
    await expect(a.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await botsJoinAndReady(await bots.spawn(3), U(b), room.roomCode);
    await e2e.setRoles({ [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }, { roomId: room.roomId });
    await expectPartyCount(b.page, 5);
    await readyUi(b.page);
    await expect(b.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await b.page.getByRole('button', { name: '게임시작' }).click();
    await expect(a.page).toHaveURL(/\/ingame/, { timeout: 20_000 });

    // A 새 판 역할 창, 판 화면엔 옛 판 봇 카드 없음
    const dialog = revealDialog(a.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText('귀족', { exact: true })).toBeVisible();
    // 새 판 카드가 그려진 뒤에 옛 판 봇 카드가 없는지 봄
    await expect(N.cardStatus(a.page, b.account.nickname)).toHaveCount(1);
    const g2 = await e2e.gameOf(U(a));
    expect(g2?.gameId, '새 판').not.toBe(oldGameId);
    for (const bot of t.bots) await expect(N.cardStatus(a.page, bot.account.nickname)).toHaveCount(0);
});
