'use strict';

// 내가 재판으로 처형된 뒤 브라우저 시험 (PC): 추방 연출 뒤 관전, 내 채팅은 죽은 사람끼리, 나가면 바로 다른 방 만들기 됨
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-062·064·065
const { test, expect } = require('../../helpers/fixtures');
const { createRoomUi } = require('../room/roomHelpers');
const c = require('./c-chat/_lib');
const K = require('./_a04-pc');

const { uuidOf } = K;

// n명 판(나 시민, 첫 봇 광대)에서 봇 표로 내가 처형됨 → 추방 연출을 지나 "사망 후 선택" 창이 뜬 데까지
async function getExecuted(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.expectTribunal(user.page, user.account.nickname);
    await K.botsVerdict(t, 'GUILTY', t.bots);
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(user)).alive).toBe(false);
    await K.expectExpelled(user.page, user.account.nickname);
    await K.passExpulsion(user.page, { then: K.deadChoice(user.page) });
    return t;
}

test('A04-E-062 PC 7명 판 내가 피고·유죄 → 추방 연출 뒤 "사망 후 선택" → 관전 계속하기 → 판 화면에 남아 내 카드 사망 @game @smoke', async ({ user, table }) => {
    await getExecuted(table, user, 7);
    const page = user.page;
    const choice = K.deadChoice(page);
    await K.readable(choice.getByRole('button', { name: '관전 계속하기' }));
    await K.readable(choice.getByRole('button', { name: '게임 나가기' }));
    await choice.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(choice).toBeHidden();
    await expect(page).toHaveURL(/\/ingame/);
    await K.night.expectCard(page, user.account.nickname, 'dead');
    // 표시 칸은 누름이 통과하는 칸이라 가려짐 검사는 뺌
    await K.readable(c.deadBadge(page), { uncovered: false });
});

test('A04-E-064 PC 8명 판 처형된 내가 글을 씀 → 내 글이 죽은 사람끼리 채널, "죽은 사람끼리" 표시, 산 봇은 못 받음 @game', async ({ user, table }) => {
    const t = await getExecuted(table, user, 8);
    const page = user.page;
    const text = c.uniq('처형뒤');
    // 사망 후 선택(관전 계속하기)·안내 창을 닫고 채팅 칸이 열리면 보냄
    await c.say(page, text);
    await expect(c.chatLog(page)).toContainText(text);
    expect(await c.lineChannel(page, text)).toBe('DEAD');
    await K.readable(c.deadBadge(page), { uncovered: false });
    // 산 봇에게 간 알림 어디에도 그 글이 없음 (내 글이 화면에 뜰 만큼 지난 뒤)
    for (const bot of t.bots) expect(bot.events.some((r) => r.payload?.text === text)).toBe(false);
});

test('A04-E-065 PC 6명 판 처형된 내가 "게임 나가기" → 판에서 나가고 바로 새 방 만들기 됨 @game', async ({ user, table }) => {
    const t = await getExecuted(table, user, 6);
    const page = user.page;
    // 나가기는 브라우저 확인 창을 한 번 띄움 → "확인"으로 받음 (안 받으면 취소로 처리됨)
    const asked = [];
    page.on('dialog', (dialog) => { asked.push(dialog.message()); dialog.accept().catch(() => {}); });
    await K.deadChoice(page).getByRole('button', { name: '게임 나가기' }).click();
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 20000 });
    expect(asked.length).toBeGreaterThan(0);
    // 판은 아직 도는 중 (나만 빠짐)
    expect((await t.state()).phase).not.toBe('ENDED');
    const room = await createRoomUi(user, {});
    expect(room.hostUuid).toBe(uuidOf(user));
    await expect(page).toHaveURL(/\/game-matching/);
});
