// 모바일 가로·태블릿 인게임: 폰 가로(812×375)·태블릿 세로(768×1024)·태블릿 가로(1024×768)는 카톡형 대신 칸 배치
// (위 줄·진행 바·카드 판·채팅·행동 줄), 세로↔가로로 돌려도 채팅·시스템 줄·이모티콘 기록이 남는지
// 프로젝트는 mobile 그대로 두고 시험 안에서 화면 크기만 바꿈
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, say, botSay, botEmoji, botLeave, clearOverlays, overflowX, BASIC_EMOJI } = require('./_talk');

const SIZES = [
    { name: '폰 가로', width: 812, height: 375, sideBySide: true },
    { name: '태블릿 세로', width: 768, height: 1024, sideBySide: false },
    { name: '태블릿 가로', width: 1024, height: 768, sideBySide: true },
];

const slot = (page, name) => page.locator(`[data-slot="${name}"]`).filter({ hasNot: page.locator('[data-talk-layout]') }).last();
const wideChat = (page) => page.getByRole('complementary', { name: '채팅' });

async function wideDay(table, user, size, o = {}) {
    await user.page.setViewportSize({ width: size.width, height: size.height });
    const t = await startTalkGame(table, user, { bots: 3, ...o });
    t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    await toDay(t, user.page, { line: undefined });
    await clearOverlays(user.page);
    return t;
}

for (const size of SIZES) {
    test.describe(`${size.name} ${size.width}×${size.height}`, () => {
        test(`${size.name}이면 → 카톡형 대신 위 줄·진행 바·카드 판·채팅·행동 줄 칸 배치가 보임 @game`, async ({ user, table }) => {
            await wideDay(table, user, size);
            await expect(talk.layout(user.page)).toHaveCount(0);
            for (const name of ['top', 'timebar', 'board', 'chat', 'actions']) await expect(slot(user.page, name)).toBeVisible();
            await expect(talk.strip(user.page)).toHaveCount(0);
        });

        test(`${size.name} 판 화면은 → 가로로 넘치지 않음 @game`, async ({ user, table }) => {
            await wideDay(table, user, size);
            expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
        });

        test(`${size.name}이면 → 카드 판에 참가자 4명 카드가 다 보임 @game`, async ({ user, table }) => {
            await wideDay(table, user, size);
            await expect(talk.board(user.page).locator('[data-board-slot]')).toHaveCount(4);
            await expect(talk.boardSlot(user.page, user.account.nickname)).toBeVisible();
        });

        test(`${size.name}이면 → 입력칸이 화면 바닥이 아니라 채팅 칸 안에 있음 @game`, async ({ user, table }) => {
            await wideDay(table, user, size);
            await expect(slot(user.page, 'chat').getByRole('textbox', { name: '채팅 입력' })).toBeVisible();
            await expect(user.page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);
        });

        test(`${size.name}에서 말을 보내면 → 채팅 칸 채팅 내역에 보임 @game`, async ({ user, table }) => {
            const t = await wideDay(table, user, size);
            await user.page.getByRole('textbox', { name: '채팅 입력' }).fill('넓은 화면 말');
            await user.page.getByRole('button', { name: '채팅 보내기' }).click();
            await botSay(t, 0, '넓은 화면 봇 말');
            const log = wideChat(user.page).getByRole('log', { name: '채팅 내역' });
            await expect(log).toContainText('넓은 화면 말');
            await expect(log).toContainText('넓은 화면 봇 말');
        });

        test(`${size.name}이면 → 카드 판과 채팅 칸이 ${size.sideBySide ? '왼쪽·오른쪽으로 나란히' : '위아래로'} 놓임 @game`, async ({ user, table }) => {
            await wideDay(table, user, size);
            const board = await slot(user.page, 'board').boundingBox();
            const chat = await slot(user.page, 'chat').boundingBox();
            if (size.sideBySide) {
                expect(board.x + board.width).toBeLessThanOrEqual(chat.x + 2);
            } else {
                expect(board.y + board.height).toBeLessThanOrEqual(chat.y + 2);
            }
        });

        test(`${size.name}이면 → 진행 바를 펼치면 낮 상태 글과 타이머가 보임 @game`, async ({ user, table }) => {
            await wideDay(table, user, size);
            // 넓은 배치 진행 바는 처음 접힘(데스크톱과 같음, 9faad08a·useTimebar.js) → 펼쳐야 단계 머리·타이머가 그려짐
            await expect(slot(user.page, 'timebar').getByRole('timer')).toHaveCount(0);
            await slot(user.page, 'timebar').getByRole('button', { name: '시간흐름바 확대' }).click();
            await expect(slot(user.page, 'timebar').getByRole('timer')).toBeVisible();
            await expect(slot(user.page, 'timebar')).toContainText('[낮-토론과 투표]');
        });

        test(`${size.name}에서 남의 카드를 누르면 → 카드 메뉴 시트가 올라옴 @game`, async ({ user, table }) => {
            const t = await wideDay(table, user, size);
            await talk.boardSlot(user.page, t.bots[1].nickname).click();
            await expect(user.page.getByRole('dialog', { name: t.bots[1].nickname })).toBeVisible();
            await expect(talk.cardSheet(user.page).getByRole('menuitem', { name: '투표하기' })).toBeDisabled();
        });
    });
}

test.describe('세로 ↔ 가로 돌리기', () => {
    test('폰을 세로에서 가로로 돌리면 → 카톡형이 칸 배치로 바뀌고 다시 세로로 돌리면 카톡형으로 돌아옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await expect(talk.layout(user.page)).toBeVisible();
        await user.page.setViewportSize({ width: 812, height: 375 });
        await expect(talk.layout(user.page)).toHaveCount(0);
        await expect(talk.board(user.page)).toBeVisible();
        await user.page.setViewportSize({ width: 375, height: 812 });
        await expect(talk.layout(user.page)).toBeVisible();
        await expect(talk.strip(user.page)).toBeVisible();
    });

    test('세로에서 오간 말은 → 가로로 돌려도 채팅 칸에 그대로 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await say(user.page, '돌리기 전 말');
        await user.page.setViewportSize({ width: 812, height: 375 });
        await expect(wideChat(user.page).getByRole('log', { name: '채팅 내역' })).toContainText('돌리기 전 말');
    });

    test('가로에서 쓴 말은 → 세로로 돌리면 내 말풍선(오른쪽)으로 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await user.page.setViewportSize({ width: 812, height: 375 });
        await user.page.getByRole('textbox', { name: '채팅 입력' }).fill('가로에서 쓴 말');
        await user.page.getByRole('button', { name: '채팅 보내기' }).click();
        await expect(wideChat(user.page).getByRole('log', { name: '채팅 내역' })).toContainText('가로에서 쓴 말');
        await user.page.setViewportSize({ width: 375, height: 812 });
        await expect(talk.mine(user.page).filter({ hasText: '가로에서 쓴 말' })).toBeVisible();
    });

    test('세로에서 생긴 죽음 시스템 줄은 → 가로로 돌렸다 세로로 돌아와도 남아 있음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }) });
        await toDay(t, user.page);
        const bot = t.bots[2];
        await botLeave(t, 2);
        await expect(talk.system(user.page).filter({ hasText: bot.nickname })).toBeVisible({ timeout: 20000 });
        await user.page.setViewportSize({ width: 812, height: 375 });
        await expect(talk.layout(user.page)).toHaveCount(0);
        await user.page.setViewportSize({ width: 375, height: 812 });
        await expect(talk.system(user.page).filter({ hasText: `${bot.nickname}님이 죽었습니다` })).toBeVisible();
    });

    test('가로로 돌려 둔 동안 온 이모티콘은 → 세로로 돌아오면 채팅방에 이모티콘 줄로 남아 있음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await user.page.setViewportSize({ width: 812, height: 375 });
        await expect(talk.board(user.page)).toBeVisible();
        await botEmoji(t, 0, BASIC_EMOJI.love.id);
        await user.page.setViewportSize({ width: 375, height: 812 });
        await expect(talk.log(user.page).locator(`[data-talk-emoji="${BASIC_EMOJI.love.id}"]`)).toBeVisible();
    });

    test('폰 가로에서 입력칸을 누르면(높이가 낮음) → 카드 판은 접지 않고 그대로 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await user.page.setViewportSize({ width: 812, height: 375 });
        await user.page.getByRole('textbox', { name: '채팅 입력' }).focus();
        await expect(user.page.locator('[data-compact-typing]')).toHaveCount(1);
        await expect(slot(user.page, 'board')).toBeVisible();
        await expect(slot(user.page, 'timebar')).toBeVisible();
    });

    test('폰 가로에서 역할 공개 창이 떠도 → 창과 확인 버튼이 낮은 화면 안에 다 들어옴 @game', async ({ user, table }) => {
        await user.page.setViewportSize({ width: 812, height: 375 });
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        const dialog = user.page.getByRole('dialog', { name: '내 역할 보기' });
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await expect(dialog.getByRole('button', { name: '확인' })).toBeInViewport({ ratio: 1 });
    });
});
