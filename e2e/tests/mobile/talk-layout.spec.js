// 모바일 카톡형 인게임 배치: 폰 세로(375×812)에서 위 줄·단계 줄·초상 띠·채팅방·행동 줄·입력칸이 한 줄로 쌓이는지
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, overflowX } = require('./_talk');

test.describe('카톡형 배치 (폰 세로)', () => {
    test('폰 세로로 판에 들어가면 → 위 줄·단계 줄·초상 띠·채팅방·행동 줄·입력칸이 다 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        await expect(talk.layout(page)).toBeVisible();
        await expect(page.getByRole('button', { name: '게임 나가기' })).toBeVisible();
        await expect(talk.phaseLine(page)).toBeVisible();
        await expect(talk.strip(page)).toBeVisible();
        await expect(talk.chat(page)).toBeVisible();
        await expect(talk.actionRow(page)).toBeVisible();
        await expect(talk.input(page)).toBeVisible();
        await expect(talk.send(page)).toBeVisible();
    });

    test('폰 세로 판 화면은 → 위에서 아래로 위 줄·초상 띠·채팅방·행동 줄·입력칸 순서 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        const top = (await talk.phaseLine(page).boundingBox()).y;
        const strip = (await talk.strip(page).boundingBox()).y;
        const chat = (await talk.chat(page).boundingBox()).y;
        const actions = (await talk.actionRow(page).boundingBox()).y;
        const input = (await talk.input(page).boundingBox()).y;
        expect(top).toBeLessThan(strip);
        expect(strip).toBeLessThan(chat);
        expect(chat).toBeLessThan(actions);
        expect(actions).toBeLessThan(input);
    });

    test('폰 세로 판 화면은 → 375 폭에서 가로로 넘치지 않음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 4 });
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('폰 세로 판 화면에서 → 채팅방이 다른 칸보다 가장 큰 자리를 차지함 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        const chat = await talk.chat(page).boundingBox();
        const strip = await talk.strip(page).boundingBox();
        const actions = await talk.actionRow(page).boundingBox();
        expect(chat.height).toBeGreaterThan(strip.height);
        expect(chat.height).toBeGreaterThan(actions.height);
        expect(chat.height).toBeGreaterThan(812 * 0.3);
    });

    test('위 줄 버튼(나가기·전적목록·설정·내 역할 보기)은 → 손가락으로 누르기 좋게 44px 이상 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        for (const name of ['게임 나가기', '플레이어별 전적목록', '인게임 설정', '내 역할 보기']) {
            const box = await page.getByRole('button', { name, exact: true }).boundingBox();
            expect(box.width, name).toBeGreaterThanOrEqual(44);
            expect(box.height, name).toBeGreaterThanOrEqual(44);
        }
    });

    test('단계 줄·보내기 버튼·초상 띠 칸은 → 누르는 높이 44px 이상 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        expect((await talk.phaseLine(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
        expect((await talk.send(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
        const slot = await talk.mySlot(page).boundingBox();
        expect(slot.width).toBeGreaterThanOrEqual(44);
        expect(slot.height).toBeGreaterThanOrEqual(44);
    });

    test('입력칸은 → 화면 바닥 가까이 있고 TYPE HERE... 안내 글이 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        await expect(talk.input(page)).toHaveAttribute('placeholder', 'TYPE HERE...');
        await expect(talk.input(page)).toHaveAttribute('enterkeyhint', 'send');
        const box = await page.locator('[data-chat-composer]').boundingBox();
        expect(box.y + box.height).toBeGreaterThan(812 - 120);
    });

    test('역할 공개 창이 떠 있는 동안 → 입력칸 자리를 눌러도 덮개가 받아서 입력칸에 안 닿음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        const { page } = user;
        await expect(page.getByRole('dialog', { name: '내 역할 보기' })).toBeVisible({ timeout: 20000 });
        const box = await talk.input(page).boundingBox();
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-chat-composer]') !== null, [box.x + box.width / 2, box.y + box.height / 2]);
        expect(hit).toBe(false);
    });

    test('역할 공개 창을 확인으로 닫으면 → 잠금이 풀리고 입력칸에 글을 쓸 수 있음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        await expect(talk.layout(page)).not.toHaveAttribute('inert', '');
        await talk.input(page).fill('잠금 풀림');
        await expect(talk.input(page)).toHaveValue('잠금 풀림');
    });

    test('판 처음엔 → 진행 바가 접혀 있고 단계 줄이 "펼치기"로 읽힘 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const { page } = user;
        await expect(talk.phaseLine(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(talk.phaseLine(page)).toHaveAttribute('aria-label', /진행 바 펼치기$/);
        await expect(talk.timebarSlot(page)).toBeHidden();
    });

    test('판에 들어가면 → 주소가 /ingame이고 하단 광고 자리는 없음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        await expect(user.page).toHaveURL(/\/ingame/);
        await expect(user.page.getByRole('complementary', { name: '광고' })).toHaveCount(0);
    });
});
