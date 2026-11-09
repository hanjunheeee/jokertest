// 모바일 역할 공개: 판 시작 때 양피지 창에 내 닉네임·역할·설명, 동료 광대, 확인·덮개·Esc로 닫기, 위 줄 "내 역할 보기"로 다시 열기
const { test, expect, ui } = require('../../helpers/fixtures');
const { talk, startTalkGame, overflowX } = require('./_talk');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
// 작은 판에서 특수 역할이 나오게 직접 구성 (광대 수 = jokerCount)
const CUSTOM_ALL = { roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } };

const CASES = [
    { role: 'JOKER', label: '광대', desc: '밤마다 한 명을 지목해 처치할 수 있습니다.' },
    { role: 'CITIZEN', label: '시민', desc: '특별한 능력은 없습니다.' },
    { role: 'DOCTOR', label: '의사', desc: '광대의 공격으로부터 보호할 수 있습니다.' },
    { role: 'GUARD', label: '경비원', desc: '정체(광대 여부)를 조사할 수 있습니다.' },
    { role: 'WITCH_HUNTER', label: '마녀사냥꾼', desc: '둘째 날 밤부터 죽은 사람 한 명을 지목해' },
];

test.describe('역할 공개 창', () => {
    for (const c of CASES) {
        test(`${c.label}로 정해 시작하면 → 역할 공개 창에 내 닉네임·"${c.label}"·역할 설명이 보임 @game`, async ({ user, table }) => {
            // 특수 역할은 나만 정함 (봇 광대까지 같이 정하면 도우미가 맞바꿀 자리를 못 찾는 때가 있음, 문제목록 M-5)
            const roles = { [user.account.uuid]: c.role };
            await startTalkGame(table, user, { bots: 4, roles, settings: CUSTOM_ALL, closeReveal: false });
            const dialog = revealDialog(user.page);
            await expect(dialog).toBeVisible({ timeout: 20000 });
            await expect(dialog.getByText(user.account.nickname, { exact: true })).toBeVisible();
            await expect(dialog.getByText(c.label, { exact: true })).toBeVisible();
            await expect(dialog).toContainText(c.desc);
            await expect(user.page.locator(`[data-ingame-role-reveal="${c.role}"]`)).toHaveCount(1);
        });
    }

    test('광대 둘인 판에서 광대면 → 역할 공개 창 "동료 광대"에 다른 광대 닉네임이 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, {
            bots: 4,
            settings: { jokerCount: 2 },
            roles: ({ bots }) => ({ [user.account.uuid]: 'JOKER', [bots[1].account.uuid]: 'JOKER' }),
            closeReveal: false,
        });
        const dialog = revealDialog(user.page);
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await expect(dialog.getByText('동료 광대')).toBeVisible();
        await expect(dialog.getByRole('listitem').filter({ hasText: t.bots[1].nickname })).toBeVisible();
    });

    test('광대 하나인 판의 시민이면 → 역할 공개 창에 동료 광대 칸이 없음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 3, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }), closeReveal: false });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await expect(revealDialog(user.page).getByText('동료 광대')).toHaveCount(0);
    });

    test('역할 공개 창은 → 375 폭 화면 안에 다 들어오고 확인 버튼이 화면 안에 있음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        const dialog = revealDialog(user.page);
        await expect(dialog).toBeVisible({ timeout: 20000 });
        const box = await dialog.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        await expect(dialog.getByRole('button', { name: '확인' })).toBeInViewport();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('역할 공개 창 덮개(바깥)를 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await user.page.getByRole('button', { name: '내 역할 보기 닫기' }).click({ position: { x: 10, y: 10 } });
        await expect(revealDialog(user.page)).toHaveCount(0);
    });

    test('역할 공개 창에서 Esc를 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await user.page.keyboard.press('Escape');
        await expect(revealDialog(user.page)).toHaveCount(0);
    });

    test('역할 공개 창을 아무것도 안 누르고 두면 → 10초 뒤 저절로 닫힘 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await expect(revealDialog(user.page)).toHaveCount(0, { timeout: 14000 });
    });

    test('역할 공개 창을 닫은 뒤 위 줄 "내 역할 보기"를 누르면 → 같은 역할 창이 다시 열림 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, roles: { [user.account.uuid]: 'JOKER' } });
        await expect(revealDialog(user.page)).toHaveCount(0);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        expect(await ui.readRoleReveal(user.page)).toBe('광대');
        await expect(revealDialog(user.page)).toHaveCount(0);
        await expect(talk.layout(user.page)).toBeVisible();
    });
});
