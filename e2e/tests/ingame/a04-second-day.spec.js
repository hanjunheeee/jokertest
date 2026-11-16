'use strict';

// 둘째 날 재판 브라우저 시험 (PC, 받은 버그 8): 1일 재판에서 누른 사람이 2일·3일 재판에서도 단추를 보고 누름(새로고침 없이), 2일 표가 서버에 들어감, 피고였던 사람·처형된 사람·덮개 창
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-067~071·074·076·077·117·118·120·122·123·165·166·169·175
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// 재판 한 번: 사람이 mine을 누르고, 봇 무죄 2로 무죄 판정 (아무도 안 죽어 다음 날도 같은 인원) → 밤
async function pressAndRelease(t, page, defendant, mine) {
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(page, defendant.nickname);
    await K.calm(page);
    await K.press(page, mine);
    await K.botsVerdict(t, 'NOT_GUILTY', t.bots.filter((b) => b !== defendant).slice(0, 2));
    const after = await K.closeTribunal(t);
    expect(after.phase).toBe('NIGHT');
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(true);
}

// 그 날짜 재판을 열고 사람 화면에 유죄·무죄 단추가 읽히는지 (떠 있는 확인 창은 닫음)
async function expectButtonsOn(t, page, dayIndex, defendant) {
    await K.toDayOf(t, dayIndex);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(page, defendant.nickname);
    await K.calm(page);
    await K.expectVoteButtons(page);
}

[[67, 5, TEXT.GUILTY], [68, 6, TEXT.NOT_GUILTY], [69, 7, TEXT.GUILTY], [70, 8, TEXT.NOT_GUILTY], [71, 10, TEXT.GUILTY]].forEach(([no, n, mine], i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`A04-E-0${no} [버그 8] PC ${n}명 판 1일 재판에서 ${mine}를 누름 → 새로고침 없이 2일 재판에 단추가 읽히고 누르면 완료 글 @game${smoke}`, async ({ user, table }) => {
        const t = await K.seat(table, user, { n });
        await K.toFirstDay(t);
        await pressAndRelease(t, user.page, t.bots[2], mine);
        await expectButtonsOn(t, user.page, 2, t.bots[3]);
        await K.press(user.page, TEXT.GUILTY);
        await K.expectNotice(user.page, TEXT.DONE);
    });
});

test('A04-E-074 [버그 8] PC 8명 판 1·2·3일 재판을 다 누름 → 3일 재판에도 단추가 읽히고 눌림 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8 });
    await K.toFirstDay(t);
    await pressAndRelease(t, user.page, t.bots[2], TEXT.GUILTY);
    await expectButtonsOn(t, user.page, 2, t.bots[3]);
    await K.press(user.page, TEXT.NOT_GUILTY);
    await K.botsVerdict(t, 'NOT_GUILTY', [t.bots[0], t.bots[1]]);
    expect((await K.closeTribunal(t)).phase).toBe('NIGHT');
    await expectButtonsOn(t, user.page, 3, t.bots[4]);
    await K.press(user.page, TEXT.GUILTY);
    await K.expectNotice(user.page, TEXT.DONE);
});

test('A04-E-076 [버그 8] PC 6명 판 2일 재판에서 나만 유죄 → 서버 2일 재판에 내 유죄가 들어감(기권 아님 → 처형) @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    await K.toFirstDay(t);
    await pressAndRelease(t, user.page, t.bots[2], TEXT.GUILTY);
    const second = t.bots[3];
    await expectButtonsOn(t, user.page, 2, second);
    await K.press(user.page, TEXT.GUILTY);
    // 봇은 아무도 안 냄 → 내 표가 기권으로 세였다면 0 : 0 무죄
    const after = await K.closeTribunal(t);
    expect(after.dayIndex).toBe(2);
    expect(after.players.find((p) => p.uuid === uuidOf(second)).alive).toBe(false);
});

test('A04-E-077 [버그 8] PC 7명 판 1일 재판에서 누르고 2일 낮에 새로고침 → 2일 재판에 단추가 읽히고 눌림 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    await K.toFirstDay(t);
    await pressAndRelease(t, user.page, t.bots[2], TEXT.GUILTY);
    await K.toDayOf(t, 2);
    await user.page.reload();
    await expect(user.page).toHaveURL(/\/ingame/);
    await expectButtonsOn(t, user.page, 2, t.bots[3]);
    await K.press(user.page, TEXT.NOT_GUILTY);
});

test('A04-E-117 PC 7명 판 1일 무죄 피고가 2일에 다시 피고 → 2일 재판 창에 같은 카드·단추 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await pressAndRelease(t, user.page, defendant, TEXT.NOT_GUILTY);
    await expectButtonsOn(t, user.page, 2, defendant);
    await K.expectDefendantCard(user.page, defendant.nickname);
    await K.press(user.page, TEXT.NOT_GUILTY);
});

test('A04-E-118 [버그 8] PC 6명 판 1일 피고였던 내가(무죄) 2일엔 투표자 → 2일 재판 단추가 읽히고 눌림 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.expectTribunal(user.page, user.account.nickname);
    await K.expectNotice(user.page, TEXT.DEFENDANT);
    // 아무도 안 냄 → 무죄
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(user)).alive).toBe(true);
    await expectButtonsOn(t, user.page, 2, t.bots[2]);
    await K.press(user.page, TEXT.GUILTY);
});

test('A04-E-120 PC 8명 판 1일 처형된 내가 2일 재판을 봄 → "사망한 참가자는 투표할 수 없습니다.", 단추 없음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8 });
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.botsVerdict(t, 'GUILTY', t.bots);
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(user)).alive).toBe(false);
    await K.watchAsDead(user.page);
    const defendant = t.bots[2];
    await K.toDayOf(t, 2);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    await K.calm(user.page);
    await K.expectNotice(user.page, TEXT.DEAD);
    await K.expectNoVoteButtons(user.page);
});

test('A04-E-122 PC 6명 판 1일 재판(무죄) 뒤 → 시간 바 날짜 그대로 "제 1일", 단계는 밤 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    await K.toFirstDay(t);
    await K.expandBar(page);
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    const after = await K.closeTribunal(t);
    expect(after.phase).toBe('NIGHT');
    expect(after.dayIndex).toBe(1);
    await K.day.closeNotice(page, TEXT.NIGHT);
    const bar = K.timebar(page);
    await expect(bar).toContainText('[밤-', { timeout: 20000 });
    await expect(bar).toHaveAttribute('aria-label', '제 1일 시간 흐름');
    await K.readable(bar.getByText('제 1일', { exact: true }), { uncovered: false });
});

test('A04-E-123 [버그 8] PC 7명 판 1일은 동점이라 재판 없음 → 2일 첫 재판에 단추가 읽히고 눌림 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    await K.toFirstDay(t);
    await K.toVote(t);
    const [a, b] = [t.bots[4], t.bots[5]];
    await K.day.botsVote(t, [[t.bots[0], uuidOf(a)], [t.bots[1], uuidOf(a)], [t.bots[2], uuidOf(b)], [t.bots[3], uuidOf(b)]]);
    await t.advance();
    const night1 = await K.day.waitState(t, (g) => g.phase !== 'DAY');
    expect(night1.phase).toBe('NIGHT');
    await expectButtonsOn(t, user.page, 2, t.bots[2]);
    await K.press(user.page, TEXT.GUILTY);
});

test('A04-E-165 PC 6명 판 "낮이 되었습니다" 안내를 안 닫은 채 재판 → 안내가 안 남고 단추가 바로 눌림 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    await K.toFirstDay(t, { closeNotice: false });
    await expect(K.phaseNotice(page)).toContainText(TEXT.DAY, { timeout: 20000 });
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    await expect(K.phaseNotice(page)).toBeHidden();
    // 아무 창도 안 닫고 바로 누름 (안내가 덮고 있으면 눌리지 않음)
    await K.expectVoteButtons(page);
    await K.press(page, TEXT.GUILTY);
});

test('A04-E-166 PC 8명 판(나 경비원) 밤 조사 결과 창을 안 닫은 채 2일 재판 → 결과 창을 닫으면 단추가 읽히고 눌림 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8, me: 'GUARD' });
    const page = user.page;
    await K.toFirstDay(t);
    // 1일: 아무도 안 냄 → 재판 없이 밤, 내 차례에 봇 하나를 조사
    await K.toVote(t);
    await t.advance();
    await K.night.toTurn(t, 'GUARD', { dayIndex: 1 });
    await K.night.nightActUi(page, t.bots[1].nickname, '조사');
    await K.toDayOf(t, 2);
    const result = page.getByRole('dialog', { name: '밤 조사 결과', exact: true });
    await expect(result).toBeVisible({ timeout: 20000 });
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    // 새 낮·재판이 돼도 결과 창은 내가 닫을 때까지 남음
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: '확인' }).click();
    await expect(result).toBeHidden();
    await K.expectVoteButtons(page);
    await K.press(page, TEXT.GUILTY);
});

test('A04-E-169 PC 7명 판 1일 처형된 봇이 끊김 → 2일 낮 투표 때 그 카드에 누를 수 있는 "투표하기" 없음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    const page = user.page;
    const [executed, alive] = [t.bots[2], t.bots[3]];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(executed));
    await K.botsVerdict(t, 'GUILTY', t.bots.filter((b) => b !== executed));
    await K.closeTribunal(t);
    executed.socket.disconnect();
    await K.passExpulsion(page);
    await K.toDayOf(t, 2);
    await K.day.closeNotice(page, TEXT.DAY);
    await K.toVote(t);
    // 판에 남은 채 죽고 끊긴 사람 배지는 끊김 먼저 (화면 mergeSourcePlayerWithPreview.js playerStatus, 화면 시험이 잠가 둠) — 죽음은 아래 메뉴로 봄
    await K.night.expectCard(page, executed.nickname, 'disconnected');
    // 견줄 것: 산 봇 카드엔 누를 수 있는 "투표하기"
    const menu = await K.night.openCardMenu(page, alive.nickname);
    await expect(menu.getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await K.night.cardButton(page, executed.nickname).click();
    await expect(page.locator('[role="menuitem"][aria-label="투표하기"]:not([disabled])')).toHaveCount(0);
});

test('A04-E-175 PC 6명 판 1일 피고였던 내가 무죄 → 2일 낮 투표에서 표를 낼 수 있음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.expectTribunal(page, user.account.nickname);
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(user)).alive).toBe(true);
    await K.toDayOf(t, 2);
    await K.day.closeNotice(page, TEXT.DAY);
    await K.toVote(t);
    await expect(page.getByRole('button', { name: '기권' })).toBeEnabled();
    // 카드 메뉴 "투표하기"로 냄 → 기권 단추가 잠기면 서버가 받은 것
    await K.day.voteUi(page, t.bots[1].nickname);
});
