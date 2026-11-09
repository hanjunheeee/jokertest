// 모바일 판 끝: 결과 화면(연출 영상 → 승패 띠·참가자 목록·MVP는 목록 아래·버튼), 판마다 한 번 광고 창(5초 뒤 닫기)
const { test, expect } = require('../../helpers/fixtures');
const { overflowX, sleep } = require('./_talk');

const adDialog = (page) => page.getByRole('dialog', { name: '광고' });

/** 2인 판(나 광대 + 봇 시민) → 판 끝까지 → 결과 화면 */
async function finishGame(table, user, ui) {
    const t = await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
    await ui.readRoleReveal(user.page);
    await t.advanceUntil((s) => s.phase === 'ENDED' || s.winResult, { stepDelayMs: 800, maxSteps: 30 }).catch(() => {});
    await expect(user.page).toHaveURL(/\/gameresult/, { timeout: 30000 });
    return t;
}

/** 결과 연출 영상 넘기기 (영상이 못 돌면 건너뛰기 버튼이 뜸) → 결과 버튼까지 */
async function toResultBoard(page) {
    const lobby = page.getByRole('button', { name: '로비로' });
    const skip = page.getByRole('button', { name: '건너뛰기' });
    await expect(lobby.or(skip).first()).toBeVisible({ timeout: 30000 });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(lobby).toBeVisible({ timeout: 15000 });
}

/** 광고 창 닫기 (5초 기다림 뒤 닫기 버튼) */
async function closeAd(page) {
    const ad = adDialog(page);
    await expect(ad).toBeVisible({ timeout: 10000 });
    await ad.getByRole('button', { name: '닫기' }).click({ timeout: 10000 });
    await expect(ad).toHaveCount(0);
}

test.describe('판 끝 → 결과 화면', () => {
    test('판이 끝나면 → 모바일 결과 화면(/gameresult)으로 감 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
    });

    test('결과 화면에 들어가면 → 먼저 승패 연출 화면이 화면 전체를 덮음 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await expect(user.page.locator('[data-game-result-intro]')).toBeVisible({ timeout: 15000 });
        const box = await user.page.locator('[data-game-result-intro]').boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(375);
        expect(box.height).toBeGreaterThanOrEqual(812);
    });

    test('광대로 이긴 판 결과 화면엔 → "승리" 띠와 "광대 진영 승리"가 보임 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        await expect(user.page.getByText('승리', { exact: true })).toBeVisible();
        await expect(user.page.getByText('광대 진영 승리')).toBeVisible();
    });

    test('결과 화면 참가자 목록엔 → 판에 있던 두 사람 닉네임이 다 보임 @game', async ({ user, table, ui }) => {
        const t = await finishGame(table, user, ui);
        await toResultBoard(user.page);
        const list = user.page.getByRole('region', { name: '가면무도회 참가자 정체' });
        await expect(list.getByText(user.account.nickname)).toBeVisible();
        await expect(list.getByText(t.bots[0].nickname)).toBeVisible();
    });

    test('폰 세로 결과 화면에선 → MVP 칸이 참가자 목록 아래에 있음 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        const mvp = user.page.getByRole('complementary', { name: 'MVP 플레이어' }).locator('visible=true');
        const list = user.page.getByRole('region', { name: '가면무도회 참가자 정체' });
        await expect(mvp).toHaveCount(1);
        const mvpBox = await mvp.boundingBox();
        const listBox = await list.boundingBox();
        expect(mvpBox.y).toBeGreaterThan(listBox.y + listBox.height - 5);
    });

    test('결과 화면은 → 375 폭에서 가로로 넘치지 않음 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('결과 화면엔 → "대기방으로"·"로비로" 버튼이 화면 안에 있음 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        for (const name of ['대기방으로', '로비로']) {
            const b = user.page.getByRole('button', { name, exact: true });
            await expect(b).toBeVisible();
            const box = await b.boundingBox();
            expect(box.x + box.width).toBeLessThanOrEqual(375);
            expect(box.height).toBeGreaterThanOrEqual(40);
        }
    });

    test('결과 화면에서 광고 창을 닫고 "로비로"를 누르면 → 로비로 감 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        await closeAd(user.page);
        user.page.once('dialog', (d) => d.accept());
        await user.page.getByRole('button', { name: '로비로', exact: true }).click();
        await expect(user.page).toHaveURL(/\/lobby/, { timeout: 15000 });
    });

    test('결과 화면 아래엔 → 하단 광고 자리가 보임 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        await expect(user.page.getByRole('complementary', { name: '광고' })).toBeVisible();
    });
});

test.describe('판 끝 광고 창', () => {
    test('결과가 다 나타나면 → "광고" 창이 뜨고 "초 뒤 닫기"를 셈 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        const ad = adDialog(user.page);
        await expect(ad).toBeVisible({ timeout: 10000 });
        await expect(ad.getByText(/^\d초 뒤 닫기$/)).toBeVisible();
    });

    test('광고 창 5초가 안 지났을 땐 → 닫기 버튼이 없고 Esc로도 안 닫힘 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        const ad = adDialog(user.page);
        await expect(ad).toBeVisible({ timeout: 10000 });
        await expect(ad.getByRole('button', { name: '닫기' })).toHaveCount(0);
        await user.page.keyboard.press('Escape');
        await expect(ad).toBeVisible();
    });

    test('광고 창이 뜬 지 5초 지나면 → 닫기 버튼이 나오고 누르면 창이 닫힘 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        await closeAd(user.page);
    });

    test('광고 창을 닫은 뒤 결과 화면을 새로 열어도 → 같은 판 광고는 다시 안 뜸 @game', async ({ user, table, ui }) => {
        await finishGame(table, user, ui);
        await toResultBoard(user.page);
        await closeAd(user.page);
        await user.page.reload();
        await toResultBoard(user.page).catch(() => {});
        await sleep(3500);
        await expect(adDialog(user.page)).toHaveCount(0);
    });

});
