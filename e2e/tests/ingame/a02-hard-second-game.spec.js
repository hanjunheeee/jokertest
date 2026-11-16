'use strict';

// 같은 방 둘째 판에서 직업을 다시 나누고 첫 판 동료가 안 남는지 브라우저 시험 (PC, 어려움) — 판 끝 → 결과 화면 "대기방으로" → 다시 시작
// 목록 A02-판시작-역할.md 번호 A02-H-011~012 (첫 판 끝까지는 손잡이로 넘김, 둘째 판 역할 확인 10초는 진짜 시간)
const { test, expect } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { readyUi } = require('../../helpers/ui');
const { hostGame, botsJoinAndReady, expectPartyCount, waitResult } = require('../room/roomHelpers');
const N = require('./b-night/_night');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const U = (x) => x.account.uuid;
const REVEAL_MS = 10_000;
const SLACK_MS = 1_500;

async function openHumans(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

// 시작 때 뜬 역할 창 (안 떠 있으면 위 "내 역할 보기"로 엶)
async function openReveal(page) {
    const dialog = revealDialog(page);
    await expect(async () => {
        if (await dialog.isVisible().catch(() => false)) return;
        await N.closeNotices(page);
        await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    return dialog;
}

async function closeReveal(page) {
    const dialog = revealDialog(page);
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
}

// 결과 화면 → "대기방으로" → 대기방 화면
async function backToRoom(page) {
    await waitResult(page);
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 손님 준비 → 방장 준비 → 게임시작 → 다 판 화면, 누른 시각 돌려줌
async function readyAndStart(host, guests) {
    for (const g of guests) {
        await readyUi(g.page);
        await expect(g.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    await readyUi(host.page);
    await expect(host.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    const clickedAt = Date.now();
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const p of [host, ...guests]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    return clickedAt;
}

test('A02-H-011 사람 5명 판 끝 → 모두 "대기방으로" → 둘째 판 역할 창 다시 10초, 첫 판 동료 이름 안 남음 @game @hard @realtime @smoke', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const [a, b, c] = people;
    // 첫 판: A·B 광대(서로 동료), 나머지 시민
    const first = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: a, guests: people.slice(1), roles: first, settings: { jokers: 2 } });
    expectRoles(await t.state(), first);
    // 첫 판 A 창에 동료 B (둘째 판에서 사라지는지 볼 바탕)
    const firstDialog = await openReveal(a.page);
    await expect(firstDialog.getByRole('listitem')).toHaveText([b.account.nickname]);
    for (const h of people) await closeReveal(h.page);

    // 1일 밤 A가 C 암살 → 광대 2 : 나머지 2 → 광대 승으로 판 끝
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    await N.nightActUi(a.page, c.account.nickname, '암살');
    await expect(async () => {
        const menu = await N.openCardMenu(a.page, c.account.nickname, { timeout: 5000 });
        await expect(menu.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    const end = await N.toEnd(t);
    expect(end?.phase ?? 'ENDED', '첫 판 끝').toBe('ENDED');
    for (const h of people) await backToRoom(h.page);

    // 둘째 판: A·C 광대, B 시민 (방 설정 광대 2 그대로)
    const room = await e2e.roomOf(U(a));
    const second = Object.fromEntries(people.map((h, i) => [U(h), i === 0 || i === 2 ? 'JOKER' : 'CITIZEN']));
    await e2e.setRoles(second, { roomId: room.roomId });
    await expectPartyCount(a.page, 5);
    const clickedAt = await readyAndStart(a, people.slice(1));
    const g2 = await e2e.gameOf(U(a));
    expect(g2?.gameId, '새 판').not.toBe(t.gameId);
    expectRoles(await e2e.game(g2.gameId), second);

    // 다섯 화면 모두 역할 창 → 동료 확인 → 확인 눌러 닫고 낮까지 걸린 시간 (확인 눌러도 안 당겨짐)
    const dayMs = await Promise.all(people.map(async (h) => {
        const own = revealDialog(h.page);
        await expect(own).toBeVisible({ timeout: 20_000 });
        if (h === a) {
            await expect(own.getByText('동료 광대', { exact: true })).toBeVisible();
            await expect(own.getByRole('listitem')).toHaveText([c.account.nickname]);
        }
        if (h === b) {
            // 첫 판 동료였던 A 이름도, "동료" 글도 없음
            await expect(own.getByText('시민', { exact: true })).toBeVisible();
            await expect(own).not.toContainText('동료');
            await expect(own).not.toContainText(a.account.nickname);
        }
        await own.getByRole('button', { name: '확인' }).click();
        await expect.poll(() => h.page.getByText('낮이 되었습니다').first().isVisible().catch(() => false), {
            timeout: REVEAL_MS + 10_000, intervals: [100],
        }).toBe(true);
        return Date.now() - clickedAt;
    }));
    for (const ms of dayMs) {
        expect(ms).toBeGreaterThanOrEqual(REVEAL_MS - SLACK_MS);
        expect(ms).toBeLessThanOrEqual(REVEAL_MS + SLACK_MS);
    }
});

test('A02-H-012 사람 3 + 봇 4 = 7명 판 끝 → 사람 3만 같은 방, 새 봇 4 → 둘째 판 7명 역할 창, 첫 판 동료 표시 없음 @game @hard', async ({ players, bots }) => {
    test.setTimeout(360_000);
    const [a, b, c] = await openHumans(players, 3);
    const oldBots = await bots.spawn(4);
    // 첫 판: A·B 의사(서로 동료), C 시민, 광대는 봇
    const first = { [U(a)]: 'DOCTOR', [U(b)]: 'DOCTOR', [U(c)]: 'CITIZEN' };
    const t = await hostGame({ host: a, guests: [b, c], botList: oldBots, roles: first, settings: { custom: { JOKER: 1, DOCTOR: 2 } } });
    const s1 = await t.state();
    expectRoles(s1, first);
    let dialog = await openReveal(a.page);
    await expect(dialog.getByRole('listitem')).toHaveText([b.account.nickname]);
    for (const h of [a, b, c]) await closeReveal(h.page);

    // 광대 봇이 나감 → 산 광대 0 → 시민 승으로 판 끝
    const joker = oldBots.find((bot) => s1.players.find((p) => p.uuid === U(bot))?.role === 'JOKER');
    expect(joker, '광대 봇').toBeTruthy();
    const left = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `광대 봇 나가기 답 ${JSON.stringify(left)}`).toBe(true);
    for (const h of [a, b, c]) await backToRoom(h.page);

    // 사람 3만 돌아옴 → 새 봇 4 입장·준비
    const newBots = await bots.spawn(4);
    const room = await e2e.roomOf(U(a));
    await botsJoinAndReady(newBots, U(a), room.roomCode);
    const second = { [U(a)]: 'DOCTOR', [U(newBots[0])]: 'DOCTOR', [U(newBots[1])]: 'JOKER', [U(b)]: 'CITIZEN', [U(c)]: 'CITIZEN' };
    await e2e.setRoles(second, { roomId: room.roomId });
    await expectPartyCount(a.page, 7);
    await readyAndStart(a, [b, c]);

    const g2 = await e2e.gameOf(U(a));
    expect(g2?.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(g2.gameId);
    expect(s2.players, '둘째 판 7명').toHaveLength(7);
    const oldUuids = new Set(oldBots.map(U));
    expect(s2.players.filter((p) => oldUuids.has(p.uuid)), '첫 판 봇은 없음').toHaveLength(0);
    expectRoles(s2, { [U(a)]: 'DOCTOR', [U(b)]: 'CITIZEN', [U(c)]: 'CITIZEN' });
    const mate = s2.players.find((p) => p.uuid !== U(a) && p.role === 'DOCTOR');

    // A: 새 의사 동료만 (첫 판 동료 B 없음)
    dialog = await openReveal(a.page);
    await expect(dialog.getByText('동료 의사', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveText([mate.nickname]);
    await expect(dialog).not.toContainText(b.account.nickname);
    // B·C: 시민, 동료 글 없음 (B 창에 첫 판 동료 A 이름 없음)
    for (const h of [b, c]) {
        dialog = await openReveal(h.page);
        await expect(dialog.getByText('시민', { exact: true })).toBeVisible();
        await expect(dialog).not.toContainText('동료');
        await expect(dialog).not.toContainText(a.account.nickname);
    }
});
