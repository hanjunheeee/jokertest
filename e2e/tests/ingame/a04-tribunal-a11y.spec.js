'use strict';

// 재판 창 접근성 브라우저 시험 (PC): 자판만으로 투표, 단추가 이름으로 찾힘, 보내는 중엔 두 단추 꺼짐, 거절 글은 읽어 주는 글(role="alert")
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-134·135·137·138
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// n명 판(사람 시민)을 1일 재판까지 → 피고는 셋째 봇(시민), hook이면 화면 소켓 손잡이도 붙임
async function toTribunal(table, user, n, { hook = false } = {}) {
    if (hook) await K.hookSocket(user.page);
    const t = await K.seat(table, user, { n });
    if (hook) await K.expectHooked(user.page);
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, page: user.page };
}

test('A04-E-134 PC 6명 판 자판만으로 투표: Tab으로 "유죄"에 가서 Enter → 완료 글, 서버가 유죄 1표를 받음 @game @smoke', async ({ user, table }) => {
    const { t, defendant, page } = await toTribunal(table, user, 6);
    const guilty = K.guilty(page);
    await expect(guilty).toBeEnabled();
    // 마우스 없이: 초점이 "유죄"에 올 때까지 Tab (재판 창이 초점을 창 안에 가둠)
    for (let i = 0; i < 12; i += 1) {
        if (await guilty.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
    }
    await expect(guilty).toBeFocused();
    await page.keyboard.press('Enter');
    await K.expectNotice(page, TEXT.DONE);
    // 봇은 아무도 안 냄 → 내 유죄 1표로 처형
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(false);
});

test('A04-E-135 PC 7명 판 재판 단추가 이름으로 찾힘: 단추 "유죄"·"무죄"가 하나씩 @game', async ({ user, table }) => {
    const { page } = await toTribunal(table, user, 7);
    for (const name of [TEXT.GUILTY, TEXT.NOT_GUILTY]) {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toHaveCount(1);
        await expect(button).toBeEnabled();
        await K.expectButtonReadable(button);
    }
});

test('A04-E-137 PC 8명 판 "유죄"를 누른 직후(서버 답 전) → 두 단추가 꺼짐, 답이 오면 완료 글 @game', async ({ user, table }) => {
    const { page } = await toTribunal(table, user, 8, { hook: true });
    // 보내는 중을 붙잡아 봄: 재판 표 보내기를 잠깐 쥐고 있음 (서버 답이 너무 빨라 그냥은 못 봄)
    await K.setNet(page, { hold: true });
    await K.guilty(page).click();
    await expect(K.guilty(page)).toBeDisabled();
    await expect(K.notGuilty(page)).toBeDisabled();
    await K.releaseHeld(page);
    await K.expectNotice(page, TEXT.DONE);
    await K.expectNoVoteButtons(page);
});

test('A04-E-138 PC 6명 판 서버가 재판 표를 거절 → 거절 글이 role="alert"(읽어 주는 글)로 뜸 @game', async ({ user, table }) => {
    const { page } = await toTribunal(table, user, 6, { hook: true });
    // 거절 만들기: 재판 표의 날짜를 하루 앞으로 바꿔 보냄 → 서버가 "지난 재판"으로 거절
    await K.setNet(page, { stale: true });
    await K.guilty(page).click();
    const alert = page.getByRole('alert').filter({ hasText: TEXT.STALE_DAY });
    await expect(alert).toHaveCount(1);
    await K.readable(alert, { uncovered: false });
});
