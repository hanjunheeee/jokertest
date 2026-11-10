// 카드 메뉴: 카드 누르면 "플레이어 행동" 메뉴 (토론 중 투표 잠김·투표 단계 투표/취소·밤 내 차례 행동/취소·죽은 사람 잠김), 닫기(Esc·바깥·다른 카드)
// 띄울 항목이 없는 카드(내 카드·동료 광대·내 차례 아닌 밤)는 메뉴가 안 뜸 (useInGamePlayerCardMenu openMenu, 9/23부터 같음)
// 우클릭은 내 카드에서만 이모티콘 팔레트 (emoji.spec.js), 다른 카드 우클릭은 아무것도 안 뜸
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const menu = (page) => page.getByRole('menu', { name: '플레이어 행동' });
const CUSTOM = (counts) => ({ roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...counts }, jokerCount: counts.JOKER ?? 1 });

async function solo({ user, table, role = 'CITIZEN', bots = 3, settings = {}, until = 'DAY' }) {
    const t = await c.startGame(table, { humans: [user], bots, settings, roles: ({ bots: b }) => (role === 'JOKER' ? { [user.account.uuid]: 'JOKER' } : { [user.account.uuid]: role, [b[0].account.uuid]: 'JOKER' }) });
    if (typeof until === 'function') await t.advanceUntil(until, { stepDelayMs: 500 });
    else await c.phaseTo(t, until);
    await c.readyToChat(user.page);
    return t;
}
const toVote = (t) => t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE', { stepDelayMs: 500 });
async function openMenu(page, nickname) {
    await c.dismissOverlays(page);
    await c.card(page, nickname).click();
    await expect(menu(page)).toBeVisible();
}
// 카드를 눌러도 메뉴가 안 뜨는지 (안 뜨는 것을 보려고 잠깐 기다림)
async function expectNoMenu(page, cardLocator) {
    await c.dismissOverlays(page);
    await cardLocator.click();
    await c.sleep(400);
    await expect(menu(page)).toHaveCount(0);
}

test.describe('낮 토론', () => {
    test('토론 중 다른 사람 카드를 누르면 → "투표하기"가 잠긴 채 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await expect(menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true })).toBeDisabled();
    });

    test('토론 중 잠긴 투표하기에는 → "토론 중" 이유 글이 붙음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await expect(menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true })).toHaveAttribute('title', /토론 중/);
    });

    test('카드 메뉴가 열리면 → 그 카드가 aria-expanded=true가 됨 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await expect(c.card(user.page, t.bots[1].nickname)).toHaveAttribute('aria-expanded', 'true');
    });

    test('토론 중 내 카드를 누르면 → 행동 메뉴가 안 뜸 @game', async ({ user, table }) => {
        await solo({ user, table });
        await expectNoMenu(user.page, c.selfCard(user.page, user.account.nickname));
    });

    test('메뉴가 열린 채 내 카드를 누르면 → 메뉴가 닫히고 내 카드 메뉴도 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await expectNoMenu(user.page, c.selfCard(user.page, user.account.nickname));
        await expect(c.card(user.page, t.bots[1].nickname)).toHaveAttribute('aria-expanded', 'false');
    });

    test('메뉴가 열린 채 Esc를 누르면 → 메뉴가 닫힘 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await user.page.keyboard.press('Escape');
        await expect(menu(user.page)).toHaveCount(0);
    });

    test('메뉴 바깥(채팅 칸)을 누르면 → 메뉴가 닫힘 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await c.chatBox(user.page).click();
        await expect(menu(user.page)).toHaveCount(0);
    });

    test('메뉴가 열린 채 다른 카드를 누르면 → 메뉴가 그 카드로 옮겨감 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openMenu(user.page, t.bots[1].nickname);
        await c.card(user.page, t.bots[2].nickname).click();
        await expect(c.card(user.page, t.bots[2].nickname)).toHaveAttribute('aria-expanded', 'true');
        await expect(c.card(user.page, t.bots[1].nickname)).toHaveAttribute('aria-expanded', 'false');
        await expect(menu(user.page)).toHaveCount(1);
    });

    test('카드에 Tab으로 가서 Enter를 누르면 → 키보드로도 메뉴가 열림 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await c.card(user.page, t.bots[1].nickname).focus();
        await user.page.keyboard.press('Enter');
        await expect(menu(user.page)).toBeVisible();
    });

    test('다른 사람 카드를 우클릭하면 → 카드 메뉴도 팔레트도 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await c.card(user.page, t.bots[1].nickname).click({ button: 'right' });
        await c.sleep(400);
        await expect(menu(user.page)).toHaveCount(0);
        await expect(user.page.getByRole('group', { name: '이모티콘 팔레트' })).toHaveCount(0);
    });
});

test.describe('낮 투표', () => {
    test('투표 단계에 다른 사람 카드를 누르면 → "투표하기"가 눌림 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await toVote(t);
        await openMenu(user.page, t.bots[1].nickname);
        await expect(menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true })).toBeEnabled();
    });

    test('투표하기를 누르면 → 다시 열었을 때 "투표취소"로 바뀜 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await toVote(t);
        await openMenu(user.page, t.bots[1].nickname);
        await menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true }).click();
        await expect.poll(async () => {
            if (!(await menu(user.page).isVisible())) await c.card(user.page, t.bots[1].nickname).click();
            return menu(user.page).getByRole('menuitem', { name: '투표취소' }).count();
        }, { timeout: 10000 }).toBe(1);
    });

    test('투표취소를 누르면 → 다시 "투표하기"로 돌아옴 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await toVote(t);
        await openMenu(user.page, t.bots[1].nickname);
        await menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true }).click();
        await expect.poll(async () => {
            if (!(await menu(user.page).isVisible())) await c.card(user.page, t.bots[1].nickname).click();
            return menu(user.page).getByRole('menuitem', { name: '투표취소' }).count();
        }, { timeout: 10000 }).toBe(1);
        await menu(user.page).getByRole('menuitem', { name: '투표취소' }).click();
        await expect.poll(async () => {
            if (!(await menu(user.page).isVisible())) await c.card(user.page, t.bots[1].nickname).click();
            return menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true }).count();
        }, { timeout: 10000 }).toBe(1);
    });

    test('투표 단계에 내 카드를 누르면 → 행동 메뉴가 안 뜸 (나는 못 찍음) @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await toVote(t);
        await expectNoMenu(user.page, c.selfCard(user.page, user.account.nickname));
    });

    test('죽은 내가 투표 단계에 카드를 누르면 → 투표하기가 "사망한 플레이어는 행동할 수 없습니다"로 잠김 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await t.stopBots();
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE', { stepDelayMs: 500 });
        await c.readyToChat(user.page);
        const s = await t.state();
        const alive = t.bots.find((b) => !c.isDead(s, b.account.uuid));
        await openMenu(user.page, alive.nickname);
        const item = menu(user.page).getByRole('menuitem', { name: '투표하기', exact: true });
        await expect(item).toBeDisabled();
        await expect(item).toHaveAttribute('title', '사망한 플레이어는 행동할 수 없습니다');
    });
});

test.describe('밤 내 차례', () => {
    test('광대 차례에 광대인 내가 시민 카드를 누르면 → "암살"이 눌림 @game', async ({ user, table }) => {
        const t = await solo({ user, table, role: 'JOKER', until: (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER' });
        await openMenu(user.page, t.bots[1].nickname);
        await expect(menu(user.page).getByRole('menuitem', { name: '암살' })).toBeEnabled();
    });

    test('광대 둘 중 내가 암살을 누르면 → 다시 열었을 때 "취소하기"로 바뀜 @game', async ({ user, table }) => {
        // 광대 혼자면 내자마자 그 차례가 닫혀 다시 못 엶 (서버 handlers/night.js), 동료 광대 봇은 안 내게 둠
        const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[0].account.uuid]: 'JOKER' }) });
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER', { stepDelayMs: 500 });
        await c.readyToChat(user.page);
        await openMenu(user.page, t.bots[1].nickname);
        await menu(user.page).getByRole('menuitem', { name: '암살' }).click();
        await expect.poll(async () => {
            if (!(await menu(user.page).isVisible())) await c.card(user.page, t.bots[1].nickname).click();
            return menu(user.page).getByRole('menuitem', { name: '취소하기' }).count();
        }, { timeout: 10000 }).toBe(1);
    });

    test('동료 광대 카드를 누르면 → 행동 메뉴가 안 뜸 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[0].account.uuid]: 'JOKER' }) });
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER', { stepDelayMs: 500 });
        await c.readyToChat(user.page);
        await expectNoMenu(user.page, c.card(user.page, t.bots[0].nickname));
    });

    test('광대 차례에 시민인 내가 카드를 누르면 → 행동 메뉴가 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, until: (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER' });
        await expectNoMenu(user.page, c.card(user.page, t.bots[1].nickname));
    });

    test('의사 차례에 의사인 내가 카드를 누르면 → "보호"가 눌림 @game', async ({ user, table }) => {
        const t = await solo({ user, table, role: 'DOCTOR', settings: CUSTOM({ DOCTOR: 1 }), until: (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR' });
        await openMenu(user.page, t.bots[1].nickname);
        await expect(menu(user.page).getByRole('menuitem', { name: '보호' })).toBeEnabled();
    });

    test('경비원 차례에 경비원인 내가 카드를 누르면 → "조사"가 눌림 @game', async ({ user, table }) => {
        const t = await solo({ user, table, role: 'GUARD', settings: CUSTOM({ GUARD: 1 }), until: (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'GUARD' });
        await openMenu(user.page, t.bots[1].nickname);
        await expect(menu(user.page).getByRole('menuitem', { name: '조사' })).toBeEnabled();
    });

    test('광대 차례에 의사인 내가 카드를 누르면 → 아직 내 차례가 아니라 행동 메뉴가 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, role: 'DOCTOR', settings: CUSTOM({ DOCTOR: 1 }), until: (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER' });
        await expectNoMenu(user.page, c.card(user.page, t.bots[1].nickname));
    });
});
