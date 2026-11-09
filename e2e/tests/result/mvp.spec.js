// MVP 칸: 이긴 팀 한 명이 "MVP 플레이어"로 나옴, 진 팀은 MVP가 안 됨
const { test, expect } = require('../../helpers/fixtures');
const h = require('../room/roomHelpers');

const mvpPanel = (page) => page.getByRole('complementary', { name: 'MVP 플레이어' });
const mvpName = async (page) => (await mvpPanel(page).getByRole('paragraph').innerText()).trim();

test.describe('MVP @game', () => {
    test('판이 끝나면 → 결과 화면에 "MVP 플레이어" 칸과 이름이 보임', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await expect(mvpPanel(user.page)).toContainText('MVP 플레이어');
        expect((await mvpName(user.page)).length).toBeGreaterThan(0);
    });

    test('광대 혼자 이긴 판이면 → MVP는 이긴 광대(나)', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        expect(await mvpName(user.page)).toBe(user.account.nickname);
    });

    test('내가 광대에게 진 판이면 → MVP는 이긴 광대 봇이고 내가 아님', async ({ user, table }) => {
        const { t } = await h.playToResult({ user, table, kind: 'jokerLose' });
        expect(await mvpName(user.page)).toBe(t.bots[0].nickname);
    });

    test('시민 편이 이긴 판이면 → MVP는 시민 편 한 명이고 광대가 아님', async ({ user, table }) => {
        const { t, joker } = await h.playToResult({ user, table, kind: 'citizenWin' });
        const name = await mvpName(user.page);
        const jokerNick = t.bots.find((b) => b.account.uuid === joker).nickname;
        expect(name).not.toBe(jokerNick);
        expect([user.account.nickname, t.bots[1].nickname]).toContain(name);
    });

    test('MVP 칸은 → 하나만 있음', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'citizenWin' });
        await expect(mvpPanel(user.page)).toHaveCount(1);
        await expect(mvpPanel(user.page).getByRole('paragraph')).toHaveCount(1);
    });

    test('MVP 이름은 → 결과 목록 참가자 중 한 사람 이름과 같음', async ({ user, table }) => {
        const { list } = await h.playToResult({ user, table, kind: 'citizenWin' });
        const name = await mvpName(user.page);
        await expect(list.getByRole('listitem').filter({ hasText: name })).toHaveCount(1);
    });

    test('사람 둘이 같은 판을 하면 → 두 사람 화면의 MVP 이름이 같음', async ({ user, table, players }) => {
        const other = await players.add();
        await h.playToResult({ user, table, kind: 'jokerWin', extraHumans: [other] });
        await h.waitResult(other.page);
        await expect(mvpPanel(other.page)).toBeVisible();
        expect(await mvpName(other.page)).toBe(await mvpName(user.page));
    });
});
