// 결과 화면: 승리/패배 띠·이긴 진영 띠·참가자 정체 목록(직업 공개)·내 정보 표시·연출 영상
const { test, expect } = require('../../helpers/fixtures');
const h = require('../room/roomHelpers');

// 나(시민)·봇 광대·봇 특수 직업 3인 판: 광대 봇이 첫 밤에 나를 죽여 광대 승 → 결과 화면, 특수 직업 봇 돌려줌
async function specialRoleGame(user, table, role) {
    const me = user.account.uuid;
    const counts = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [role]: 1 };
    let joker;
    const t = await table.setup({
        humans: [user], bots: 2,
        settings: { roleCompositionMode: 'custom', roleCounts: counts },
        roles: ({ bots }) => { joker = bots[0].account.uuid; return { [me]: 'CITIZEN', [joker]: 'JOKER', [bots[1].account.uuid]: role }; },
    });
    t.playBots((bot) => (bot.account.uuid === joker
        ? { dayVote: 'abstain', tribunal: 'skip', night: me }
        : { dayVote: 'abstain', tribunal: 'skip', night: 'skip' }));
    await h.closeReveals([user.page]);
    await h.finishGame(t, { stepDelayMs: 1200 });
    await h.waitResult(user.page);
    return t.bots[1];
}

const banner = (page) => page.getByRole('main').getByRole('paragraph').filter({ hasText: /^(승리|패배)$/ });

test.describe('결과 화면 @game', () => {
    test('광대인 내가 이기면 → 띠에 "승리", 진영 띠에 "광대 진영 승리"', async ({ user, table }) => {
        const { list } = await h.playToResult({ user, table, kind: 'jokerWin' });
        await expect(banner(user.page)).toHaveText('승리');
        await expect(list).toContainText('광대 진영 승리');
    });

    test('시민인 내가 광대에게 지면 → 띠에 "패배", 진영 띠에 "광대 진영 승리"', async ({ user, table }) => {
        const { list } = await h.playToResult({ user, table, kind: 'jokerLose' });
        await expect(banner(user.page)).toHaveText('패배');
        await expect(list).toContainText('광대 진영 승리');
    });

    test('시민 편이 광대를 처형해 이기면 → 시민인 나에게 "승리"와 "시민 진영 승리"', async ({ user, table }) => {
        const { list } = await h.playToResult({ user, table, kind: 'citizenWin' });
        await expect(banner(user.page)).toHaveText('승리');
        await expect(list).toContainText('시민 진영 승리');
    });

    test('판이 끝나면 → 결과 화면 전에 승패 연출 영상이 먼저 나옴', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
        await h.closeReveals([user.page]);
        await h.finishGame(t);
        await expect(user.page).toHaveURL(/\/gameresult/, { timeout: 30000 });
        await expect(user.page.locator('[data-game-result-intro="win"]')).toBeAttached({ timeout: 15000 });
        await h.waitResult(user.page);
    });

    test('결과 목록 제목은 → "가면무도회 참가자 정체"이고 참가자 수만큼 줄이 있음', async ({ user, table }) => {
        const { list } = await h.playToResult({ user, table, kind: 'citizenWin' });
        await expect(list.getByRole('heading', { name: '가면무도회 참가자 정체' })).toBeVisible();
        await expect(list.getByRole('listitem')).toHaveCount(3);
    });

    test('결과 목록에서 → 내 줄에만 "내 정보" 표시가 붙음', async ({ user, table }) => {
        const { list } = await h.playToResult({ user, table, kind: 'jokerWin' });
        const mine = h.resultRow(user.page, user.account.nickname);
        await expect(mine).toContainText('내 정보');
        await expect(list.getByText('내 정보')).toHaveCount(1);
    });

    test('결과 목록에서 → 모든 참가자 직업이 공개됨 (광대는 "광대", 시민은 "귀족")', async ({ user, table }) => {
        const { t } = await h.playToResult({ user, table, kind: 'jokerWin' });
        await expect(h.resultRow(user.page, user.account.nickname)).toContainText('광대');
        await expect(h.resultRow(user.page, t.bots[0].nickname)).toContainText('귀족');
    });

    test('광대에게 진 판에서도 → 상대 광대의 정체가 "광대"로 공개됨', async ({ user, table }) => {
        const { t } = await h.playToResult({ user, table, kind: 'jokerLose' });
        await expect(h.resultRow(user.page, t.bots[0].nickname)).toContainText('광대');
        await expect(h.resultRow(user.page, user.account.nickname)).toContainText('귀족');
    });

    test('의사가 있는 판이면 → 의사 직업이 "주치의"로 보임', async ({ user, table }) => {
        const special = await specialRoleGame(user, table, 'DOCTOR');
        await expect(h.resultRow(user.page, special.nickname)).toContainText('주치의');
    });

    test('경비원이 있는 판이면 → 경비원 직업이 "경비원"으로 보임', async ({ user, table }) => {
        const special = await specialRoleGame(user, table, 'GUARD');
        await expect(h.resultRow(user.page, special.nickname)).toContainText('경비원');
    });

    test('마녀사냥꾼이 있는 판이면 → 결과 목록엔 마녀사냥꾼도 "귀족"으로 보임', async ({ user, table }) => {
        const special = await specialRoleGame(user, table, 'WITCH_HUNTER');
        await expect(h.resultRow(user.page, special.nickname)).toContainText('귀족');
    });

    test('결과 화면 아래에는 → "대기방으로"·"로비로" 버튼 둘이 있음', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await expect(user.page.getByRole('button', { name: '대기방으로' })).toBeVisible();
        await expect(user.page.getByRole('button', { name: '로비로' })).toBeVisible();
    });

    test('사람 둘이 한 판을 하면 → 두 사람 결과 화면이 서로 반대 승패로 보임', async ({ user, table, players }) => {
        const other = await players.add();
        await h.playToResult({ user, table, kind: 'jokerWin', extraHumans: [other] });
        await h.waitResult(other.page);
        await expect(banner(user.page)).toHaveText('승리');
        await expect(banner(other.page)).toHaveText('패배');
        await expect(h.resultRow(other.page, other.account.nickname)).toContainText('내 정보');
    });

    test('판에 결과가 없을 때 결과 주소로 바로 가면 → "게임 결과를 확인할 수 없습니다" 안내와 로비로 돌아가기', async ({ user }) => {
        await user.page.goto('/gameresult');
        await expect(user.page.getByRole('alert')).toHaveText('게임 결과를 확인할 수 없습니다', { timeout: 15000 });
        await expect(user.page.getByRole('button', { name: '로비로 돌아가기' })).toBeVisible();
    });

    test('광대 둘이 이긴 판이면 → 두 광대 모두 "광대"로 공개되고 시민은 "귀족"', async ({ user, table, players }) => {
        const other = await players.add();
        const { t } = await h.playToResult({ user, table, kind: 'jokerWin', extraHumans: [other] });
        await expect(h.resultRow(user.page, user.account.nickname)).toContainText('광대');
        await expect(h.resultRow(user.page, t.bots[0].nickname)).toContainText('광대');
        await expect(h.resultRow(user.page, other.account.nickname)).toContainText('귀족');
    });
});
