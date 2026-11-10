// 모바일 카톡형 말풍선: 내 말 오른쪽·남 말 왼쪽(닉네임·초상)·이어진 말 묶음·색·시간·글자 크기·입력칸 보내기 규칙
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, say, botSay, bgColor, overflowX, sleep, CHAT_GAP_MS } = require('./_talk');

// 말풍선 닉네임 줄 (남 말 묶음 첫 줄만)
const nameOf = (li) => li.locator('p.truncate');
// 말풍선 본문
const bodyOf = (li) => li.locator('p.whitespace-pre-wrap');

async function dayGame(table, user, o = {}) {
    const t = await startTalkGame(table, user, { bots: 3, ...o });
    t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    await toDay(t, user.page);
    return t;
}

async function openSettings(page) {
    await page.getByRole('button', { name: '인게임 설정' }).click();
    const sheet = page.getByRole('dialog', { name: '인게임 설정' });
    await expect(sheet).toBeVisible();
    return sheet;
}

test.describe('말풍선 자리', () => {
    test('내가 말을 보내면 → 채팅방 오른쪽에 내 말풍선으로 붙고 닉네임은 안 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await say(user.page, '오른쪽 말');
        const li = talk.mine(user.page).filter({ hasText: '오른쪽 말' });
        await expect(nameOf(li)).toHaveCount(0);
        const bubble = await bodyOf(li).boundingBox();
        const panel = await talk.chat(user.page).boundingBox();
        expect(panel.x + panel.width - (bubble.x + bubble.width)).toBeLessThan(30);
    });

    test('봇이 말하면 → 채팅방 왼쪽에 초상·닉네임과 함께 말풍선이 보임 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, '왼쪽 말');
        const li = talk.others(user.page).filter({ hasText: '왼쪽 말' });
        await expect(li).toBeVisible();
        await expect(nameOf(li)).toHaveText(t.bots[0].nickname);
        const bubble = await bodyOf(li).boundingBox();
        const panel = await talk.chat(user.page).boundingBox();
        expect(bubble.x - panel.x).toBeLessThan(80);
        expect(bubble.x + bubble.width).toBeLessThan(panel.x + panel.width - 20);
    });

    test('같은 봇이 이어서 두 번 말하면 → 닉네임은 첫 말풍선에만 보이고 둘째는 묶여 붙음 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, '첫째 줄');
        await botSay(t, 0, '둘째 줄');
        await expect(talk.others(user.page).filter({ hasText: '둘째 줄' })).toBeVisible();
        await expect(nameOf(talk.others(user.page).filter({ hasText: '첫째 줄' }))).toHaveCount(1);
        await expect(nameOf(talk.others(user.page).filter({ hasText: '둘째 줄' }))).toHaveCount(0);
    });

    test('다른 봇이 사이에 끼어 말하면 → 다음 말풍선에 다시 닉네임이 보임 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, 'A 첫말');
        await botSay(t, 1, 'B 끼어듦');
        await botSay(t, 0, 'A 다시');
        await expect(talk.others(user.page).filter({ hasText: 'A 다시' })).toBeVisible();
        await expect(nameOf(talk.others(user.page).filter({ hasText: 'B 끼어듦' }))).toHaveText(t.bots[1].nickname);
        await expect(nameOf(talk.others(user.page).filter({ hasText: 'A 다시' }))).toHaveText(t.bots[0].nickname);
    });

    test('말이 오간 순서대로 → 채팅방 위에서 아래로 쌓임 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, '하나');
        await say(user.page, '둘');
        await botSay(t, 1, '셋');
        await expect(talk.others(user.page).filter({ hasText: '셋' })).toBeVisible();
        const texts = await talk.lines(user.page).locator('p.whitespace-pre-wrap').allInnerTexts();
        const order = texts.filter((x) => ['하나', '둘', '셋'].includes(x));
        expect(order).toEqual(['하나', '둘', '셋']);
    });

    test('같은 판 두 번째 사람 화면에선 → 내 말이 왼쪽에 내 닉네임과 함께 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add({ mobile: true });
        const t = await startTalkGame(table, [user, p2], { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, [user.page, p2.page]);
        await say(user.page, '둘이 보는 말');
        const li = talk.others(p2.page).filter({ hasText: '둘이 보는 말' });
        await expect(li).toBeVisible();
        await expect(nameOf(li)).toHaveText(user.account.nickname);
    });
});

test.describe('말풍선 모양', () => {
    test('내 말풍선과 남의 말풍선은 → 바탕색이 다름 (내 것 금빛, 남 것 양피지색) @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, '남 색');
        await say(user.page, '내 색');
        const mine = await bgColor(bodyOf(talk.mine(user.page).filter({ hasText: '내 색' })));
        const other = await bgColor(bodyOf(talk.others(user.page).filter({ hasText: '남 색' })));
        expect(mine).toBe('rgb(217, 180, 106)');
        expect(other).toBe('rgb(239, 226, 196)');
    });

    test('닉네임 색상 표시가 켜져 있으면(기본) → 남 닉네임이 플레이어 테마 색으로 칠해짐 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, '테마 색');
        const name = nameOf(talk.others(user.page).filter({ hasText: '테마 색' }));
        await expect(name).toHaveAttribute('style', /color-mix/);
    });

    test('설정에서 닉네임 색상 표시를 끄면 → 남 닉네임이 기본 양피지색 글자로 바뀜 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botSay(t, 0, '색 끄기');
        const sheet = await openSettings(user.page);
        await sheet.getByRole('checkbox', { name: '닉네임 색상 표시' }).click();
        await expect(sheet.getByRole('checkbox', { name: '닉네임 색상 표시' })).not.toBeChecked();
        await user.page.keyboard.press('Escape');
        const name = nameOf(talk.others(user.page).filter({ hasText: '색 끄기' }));
        await expect(name).not.toHaveAttribute('style', /color-mix/);
        expect(await name.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(243, 220, 176)');
    });

    test('채팅 시간 표시는 기본으로 꺼져 있어서 → 말풍선 옆에 시각이 안 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await say(user.page, '시각 없음');
        await expect(talk.mine(user.page).filter({ hasText: '시각 없음' }).getByText(/^\d{2}:\d{2}$/)).toHaveCount(0);
    });

    test('설정에서 채팅 시간 표시를 켜면 → 말풍선 옆에 "시:분" 시각이 보임 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        const sheet = await openSettings(user.page);
        await sheet.getByRole('checkbox', { name: '채팅 시간 표시' }).click();
        await user.page.keyboard.press('Escape');
        await say(user.page, '시각 있음');
        await botSay(t, 0, '봇 시각');
        await expect(talk.mine(user.page).filter({ hasText: '시각 있음' }).getByText(/^\d{2}:\d{2}$/)).toBeVisible();
        await expect(talk.others(user.page).filter({ hasText: '봇 시각' }).getByText(/^\d{2}:\d{2}$/)).toBeVisible();
    });

    test('설정에서 채팅 글자 크기를 가장 작게 줄이면 → 채팅방 말풍선 글자가 작아짐 (기본은 가장 큼) @game', async ({ user, table }) => {
        await dayGame(table, user);
        await say(user.page, '크기 보기');
        const body = bodyOf(talk.mine(user.page).filter({ hasText: '크기 보기' }));
        const before = await body.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        const sheet = await openSettings(user.page);
        const slider = sheet.getByRole('slider', { name: '채팅 글자 크기' });
        await slider.focus();
        await expect(slider).toHaveAttribute('aria-valuenow', '100');
        await user.page.keyboard.press('Home');
        await expect(slider).toHaveAttribute('aria-valuenow', '0');
        await user.page.keyboard.press('Escape');
        await expect.poll(() => body.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(before);
    });

    test('150자 긴 말을 보내면 → 말풍선 안에서 줄이 바뀌고 화면이 가로로 안 넘침 @game', async ({ user, table }) => {
        await dayGame(table, user);
        const long = '가나다라마바사아자차'.repeat(15);
        await say(user.page, long);
        const body = bodyOf(talk.mine(user.page).filter({ hasText: long.slice(0, 20) }));
        const box = await body.boundingBox();
        expect(box.height).toBeGreaterThan(40);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('Shift+Enter로 줄을 바꿔 보내면 → 말풍선 안에서도 두 줄로 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.input(user.page).click();
        await user.page.keyboard.type('윗줄');
        await user.page.keyboard.press('Shift+Enter');
        await user.page.keyboard.type('아랫줄');
        await expect(talk.input(user.page)).toHaveValue('윗줄\n아랫줄');
        await user.page.keyboard.press('Enter');
        const body = bodyOf(talk.mine(user.page).filter({ hasText: '아랫줄' }));
        await expect(body).toBeVisible();
        expect(await body.innerText()).toBe('윗줄\n아랫줄');
    });

});

test.describe('입력칸 보내기', () => {
    test('입력칸에 쓰고 Enter를 누르면 → 보내지고 입력칸이 비워짐 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.input(user.page).fill('엔터 보냄');
        await talk.input(user.page).press('Enter');
        await expect(talk.mine(user.page).filter({ hasText: '엔터 보냄' })).toBeVisible();
        await expect(talk.input(user.page)).toHaveValue('');
    });

    test('보내기 버튼을 눌러 보내도 → 입력칸 초점이 그대로라 키보드가 안 내려감 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.input(user.page).fill('초점 유지');
        await talk.send(user.page).click();
        await expect(talk.mine(user.page).filter({ hasText: '초점 유지' })).toBeVisible();
        await expect(talk.input(user.page)).toBeFocused();
    });

    test('빈 입력칸에서 보내기를 누르면 → 아무 말풍선도 안 생김 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.send(user.page).click();
        await talk.input(user.page).press('Enter');
        await sleep(800);
        await expect(talk.mine(user.page)).toHaveCount(0);
    });

    test('0.5초 안에 두 번 보내면 → 둘째는 거절되어 알림 줄이 뜨고 첫째만 말풍선이 됨 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.input(user.page).fill('빠른 첫째');
        await talk.send(user.page).click();
        await expect(talk.mine(user.page).filter({ hasText: '빠른 첫째' })).toBeVisible();
        await talk.input(user.page).fill('빠른 둘째');
        // 사파리는 버튼 누르기 확인(스크롤·멈춤 검사)만 0.4초 가까이 걸려 0.5초를 넘기므로 같은 보내기인 Enter로 바로 보냄
        await talk.input(user.page).press('Enter');
        await expect(talk.chat(user.page).getByRole('alert')).toBeVisible();
        await expect(talk.mine(user.page).filter({ hasText: '빠른 둘째' })).toHaveCount(0);
    });

    test('거절된 뒤 조금 있다 다시 보내면 → 이번엔 말풍선이 되고 알림 줄이 사라짐 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.input(user.page).fill('먼저');
        await talk.send(user.page).click();
        await talk.input(user.page).fill('다시 보냄');
        await talk.send(user.page).click();
        await sleep(CHAT_GAP_MS);
        await talk.input(user.page).fill('다시 보냄');
        await talk.send(user.page).click();
        await expect(talk.mine(user.page).filter({ hasText: '다시 보냄' })).toBeVisible();
        await expect(talk.chat(user.page).getByRole('alert')).toHaveCount(0);
    });
});
