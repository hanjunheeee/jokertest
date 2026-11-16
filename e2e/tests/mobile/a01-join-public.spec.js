'use strict';

// 공개 방 목록으로 대기방 들어오기 브라우저 시험 (모바일) — 카드 고름 → 입장, "마감", 코드 방은 코드 입력 쪽, 고른 사이 가득 참, 3번 쫓겨남·탈주 거절
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-541~546 — 거절 글은 양피지 안내 창으로 뜸
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../room/_a01b-join-kit');

const { MSG } = K;

test('A01-E-541 모바일 공개 방 입장 (정원 6 · 봇 3) → 목록 → 입장 → 대기방 @smoke @safari', async ({ user, bots }) => {
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 6, count: 3, accessType: 'open' });
    const card = await K.pickRow(page, title);
    await expect(card).toHaveAttribute('aria-label', new RegExp(`^${title}, 3/6명`));
    await K.enterButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectParty(page, 4);
});

test('A01-E-542 모바일 "마감" (정원 5 · 봇 5) → 카드 "마감", 단추 꺼짐', async ({ user, bots }) => {
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 5, count: 5, accessType: 'open' });
    const card = await K.findRow(page, title);
    await expect(card).toHaveAttribute('aria-label', new RegExp(`^${title}, 5/5명.*, 마감$`));
    await expectReadable(card.getByText('마감', { exact: true }));
    await expect(card).toBeDisabled();
    await expect(K.enterButton(page)).toBeDisabled();
});

test('A01-E-543 모바일 코드 방은 코드 입력 쪽 (정원 8) → 바로 입장 안 됨', async ({ user, bots }) => {
    const page = user.page;
    const { title, host } = await K.botRoom(bots, { max: 8, count: 2, accessType: 'code' });
    await K.pickRow(page, title);
    const toCode = page.getByRole('button', { name: '코드 입력' });
    await expect(toCode).toBeEnabled();
    await toCode.click();
    await expect(page).toHaveURL(/\/roomInvite/);
    expect(await K.roomSize(host.uuid)).toBe(2);
});

test('A01-E-544 모바일 고른 사이 가득 참 (정원 5 · 봇 4) → "방이 가득 찼습니다."', async ({ user, bots }) => {
    const page = user.page;
    // 고른 뒤 목록 갱신 방송만 막음 (안 막으면 카드가 "마감"으로 바뀌어 못 누름)
    const lateList = K.eventFrame('public_rooms_updated');
    const tap = await K.tapSocket(page, { down: (m, t) => (t.on && lateList(m) ? 'drop' : null) });
    const { title, room } = await K.botRoom(bots, { max: 5, count: 4, accessType: 'open' });
    await K.pickRow(page, title);
    tap.on = true;
    await K.addBots(bots, room, 1);
    expect(await ui.captureAlert(page, () => K.enterButton(page).click())).toBe(MSG.FULL);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-545 모바일 3번 쫓겨남 (정원 6) → 목록 입장 → 3번 추방 글', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { title, code, host } = await K.botRoom(bots, { max: 6, count: 2, accessType: 'open' });
    await K.kickedThrice(user, host, code);
    await K.pickRow(page, title);
    expect(await ui.captureAlert(page, () => K.enterButton(page).click())).toBe(MSG.KICK3);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-546 모바일 탈주 대기 (정원 6) → 목록 입장 → 탈주 글 @game', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 6, count: 2, accessType: 'open' });
    await K.desert(table, user);
    await K.pickRow(page, title);
    expect(await ui.captureAlert(page, () => K.enterButton(page).click())).toMatch(K.DESERTED);
    await expect(page).not.toHaveURL(/\/game-matching/);
});
