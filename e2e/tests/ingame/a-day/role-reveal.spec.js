// 역할 공개 시험: 판 시작 때 뜨는 '내 역할 보기' 창 — 역할별 이름·설명, 확인·뒤 막·Esc로 닫기, 10초 뒤 저절로 닫힘, 다시 보기 버튼, 같은 편 광대 보임/안 보임
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const ALL_ROLES = L.customRoles({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 });
const ROLE_TEXT = {
    JOKER: { name: '광대', desc: '밤마다 한 명을 지목해 처치할 수 있습니다' },
    CITIZEN: { name: '시민', desc: '특별한 능력은 없습니다' },
    DOCTOR: { name: '의사', desc: '광대의 공격으로부터 보호할 수 있습니다' },
    GUARD: { name: '경비원', desc: '정체(광대 여부)를 조사할 수 있습니다' },
    WITCH_HUNTER: { name: '마녀사냥꾼', desc: '둘째 날 밤부터 죽은 사람 한 명을 지목해' },
};
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

test.describe('역할별 문구', () => {
    for (const [role, text] of Object.entries(ROLE_TEXT)) {
        test(`${text.name}로 정해 판을 시작하면 → 역할 창에 '${text.name}'과 그 역할 설명이 보임 @game`, async ({ user, table }) => {
            const t = await table.setup({ humans: [user], bots: 4, settings: ALL_ROLES, roles: { [user.account.uuid]: role } });
            const dialog = revealDialog(user.page);
            await expect(dialog).toBeVisible({ timeout: 20000 });
            await expect(dialog.getByRole('paragraph').nth(1)).toHaveText(text.name);
            await expect(dialog).toContainText(text.desc);
            expect(L.playerOf(await t.state(), user.account.uuid).role).toBe(role);
        });

        test(`${text.name} 역할 창을 닫고 '내 역할 보기' 버튼을 누르면 → 같은 '${text.name}' 창이 다시 뜸 @game`, async ({ user, table }) => {
            await table.setup({ humans: [user], bots: 4, settings: ALL_ROLES, roles: { [user.account.uuid]: role } });
            await L.closeReveal(user.page);
            await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
            const dialog = revealDialog(user.page);
            await expect(dialog).toBeVisible();
            await expect(dialog.getByRole('paragraph').nth(1)).toHaveText(text.name);
            await expect(dialog).toContainText(text.desc);
        });
    }

    test('역할 창 첫 줄에는 → 내 닉네임이 보임 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await expect(revealDialog(user.page).getByRole('paragraph').first()).toHaveText(user.account.nickname);
    });

    test('6명 자동 구성에서 의사로 정하면 → 역할 창에 의사가 보임 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 5, roles: { [user.account.uuid]: 'DOCTOR' } });
        await expect(revealDialog(user.page).getByRole('paragraph').nth(1)).toHaveText('의사', { timeout: 20000 });
    });

    test('8명 자동 구성에서 경비원으로 정하면 → 역할 창에 경비원이 보임 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 7, roles: { [user.account.uuid]: 'GUARD' } });
        await expect(revealDialog(user.page).getByRole('paragraph').nth(1)).toHaveText('경비원', { timeout: 20000 });
    });

    test('10명 자동 구성에서 마녀사냥꾼으로 정하면 → 역할 창에 마녀사냥꾼이 보임 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 9, roles: { [user.account.uuid]: 'WITCH_HUNTER' } });
        await expect(revealDialog(user.page).getByRole('paragraph').nth(1)).toHaveText('마녀사냥꾼', { timeout: 20000 });
    });

    test('5명 자동 구성(광대 1)에서는 → 판에 의사·경비원·마녀사냥꾼이 없고 사람 역할은 광대나 시민 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4 });
        const roles = (await t.state()).players.map((p) => p.role).sort();
        expect(roles).toEqual(['CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'JOKER']);
        await expect(revealDialog(user.page).getByRole('paragraph').nth(1)).toHaveText(/^(광대|시민)$/, { timeout: 20000 });
    });

    test('두 사람이 같은 판에 들어가면 → 각자 자기 역할만 봄 (광대·시민) @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        await table.setup({ humans: [user, p2], bots: 3, roles: { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'CITIZEN' } });
        await expect(revealDialog(user.page).getByRole('paragraph').nth(1)).toHaveText('광대', { timeout: 20000 });
        await expect(revealDialog(p2.page).getByRole('paragraph').nth(1)).toHaveText('시민', { timeout: 20000 });
        await expect(revealDialog(p2.page)).not.toContainText(user.account.nickname);
    });
});

test.describe('닫기', () => {
    test('역할 창 확인을 누르면 → 창이 닫히고 판 화면(제 0일)이 보임 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await L.closeReveal(user.page);
        await expect(user.page.getByText('제 0일')).toBeVisible();
    });

    test('역할 창 바깥 어두운 막을 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await user.page.getByRole('button', { name: '내 역할 보기 닫기' }).click({ position: { x: 5, y: 5 } });
        await expect(revealDialog(user.page)).toBeHidden();
    });

    test('역할 창에서 Esc를 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await user.page.keyboard.press('Escape');
        await expect(revealDialog(user.page)).toBeHidden();
    });

    test('역할 창을 아무것도 안 누르고 두면 → 10초쯤 뒤 저절로 닫힘 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        const dialog = revealDialog(user.page);
        await expect(dialog).toBeVisible({ timeout: 20000 });
        const shownAt = Date.now();
        await expect(dialog).toBeVisible({ timeout: 1000 });
        await expect(dialog).toBeHidden({ timeout: 14000 });
        expect(Date.now() - shownAt).toBeGreaterThan(6000);
    });

    test('단계를 안 넘기고 기다리면 → 서버가 10초 뒤 저절로 제 1일 낮으로 넘기고 낮 안내가 뜸 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 1 });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await L.waitState(t, (s) => s.phase === 'DAY', { timeout: 16000 });
        await L.closeNotice(user.page, '낮이 되었습니다');
        await expect(user.page.getByText('제 1일')).toBeVisible();
    });

    test('역할 공개 중 단계를 넘기면 → 저절로 연 역할 창이 10초 전이라도 닫히고 낮 안내로 바뀜 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 1 });
        await expect(revealDialog(user.page)).toBeVisible({ timeout: 20000 });
        await t.advanceUntil('DAY');
        await expect(revealDialog(user.page)).toBeHidden({ timeout: 5000 });
        await L.closeNotice(user.page, '낮이 되었습니다');
    });

    test('확인을 누른 뒤에는 → 10초가 지나도 역할 창이 다시 안 뜸 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1, settings: { dayDiscussionTime: 150 } });
        await L.closeReveal(user.page);
        await L.sleep(3000);
        await expect(revealDialog(user.page)).toBeHidden();
    });
});

test.describe('다시 보기 버튼', () => {
    test('판 화면 왼쪽 위에는 → \'내 역할 보기\' 버튼이 있음 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await L.closeReveal(user.page);
        await expect(user.page.getByRole('button', { name: '내 역할 보기', exact: true })).toBeVisible();
    });

    test('낮 토론 중 다시 보기를 누르면 → 역할 창이 뜨고 확인으로 닫힘 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4, roles: { [user.account.uuid]: 'CITIZEN' } });
        await L.toDay(t);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await expect(revealDialog(user.page)).toContainText('시민');
        await revealDialog(user.page).getByRole('button', { name: '확인' }).click();
        await expect(revealDialog(user.page)).toBeHidden();
    });

    test('낮 투표 중 다시 보기를 누르면 → 내 역할 창이 뜸 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4, roles: { [user.account.uuid]: 'JOKER' } });
        await L.toDay(t);
        await L.toVote(t);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await expect(revealDialog(user.page)).toContainText('광대');
    });

    test('다시 연 역할 창은 → 단계가 바뀌어도(토론→투표) 내가 닫을 때까지 남음 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4 });
        await L.toDay(t);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await expect(revealDialog(user.page)).toBeVisible();
        await t.advance();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        await L.sleep(1000);
        await expect(revealDialog(user.page)).toBeVisible();
    });

    test('다시 연 역할 창이 떠 있는 채 밤이 되면 → 밤 안내는 역할 창을 닫은 뒤에 뜸 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4, roles: { [user.account.uuid]: 'CITIZEN' } });
        await L.toDay(t);
        await L.toVote(t);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await L.resolveVote(t);
        await L.sleep(800);
        await expect(user.page.getByRole('dialog', { name: '단계 전환 안내' })).toBeHidden();
        await revealDialog(user.page).getByRole('button', { name: '확인' }).click();
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('밤에 다시 보기를 누르면 → 밤에도 내 역할 창이 뜸 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4, roles: { [user.account.uuid]: 'CITIZEN' } });
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await expect(revealDialog(user.page)).toContainText('시민');
    });

    test('재판을 받고 풀려난 뒤 다시 보기를 누르면 → 역할은 그대로 보임 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await table.setup({ humans: [user], bots: 4, roles: { [me]: 'CITIZEN' } });
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, me);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'NOT_GUILTY');
        await L.resolveTribunal(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await expect(revealDialog(user.page)).toContainText('시민');
    });
});

test.describe('같은 편 광대', () => {
    const TWO_JOKERS = { jokerCount: 2 };

    test('광대 둘인 판에서 내가 광대면 → 역할 창에 \'동료 광대\'와 다른 광대 닉네임이 보임 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await table.setup({ humans: [user], bots: 5, settings: TWO_JOKERS, roles: ({ bots }) => ({ [me]: 'JOKER', [bots[2].account.uuid]: 'JOKER' }) });
        const dialog = revealDialog(user.page);
        await expect(dialog).toContainText('동료 광대', { timeout: 20000 });
        await expect(dialog.getByRole('listitem')).toHaveText([t.bots[2].nickname]);
    });

    test('광대 둘인 판의 동료 목록에는 → 시민 닉네임과 내 닉네임이 없음 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await table.setup({ humans: [user], bots: 5, settings: TWO_JOKERS, roles: ({ bots }) => ({ [me]: 'JOKER', [bots[0].account.uuid]: 'JOKER' }) });
        const list = revealDialog(user.page).getByRole('list');
        await expect(list).toBeVisible({ timeout: 20000 });
        await expect(list.getByRole('listitem')).toHaveCount(1);
        for (const bot of t.bots.slice(1)) await expect(list).not.toContainText(bot.nickname);
        await expect(list).not.toContainText(user.account.nickname);
    });

    test('광대 둘인 판에서 내가 시민이면 → 역할 창에 동료 광대 칸이 없음 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 5, settings: TWO_JOKERS, roles: { [user.account.uuid]: 'CITIZEN' } });
        const dialog = revealDialog(user.page);
        await expect(dialog).toContainText('시민', { timeout: 20000 });
        await expect(dialog).not.toContainText('동료 광대');
        await expect(dialog.getByRole('list')).toHaveCount(0);
    });

    test('광대 둘인 판에서 내가 의사면 → 동료 광대 칸이 없음 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 5, settings: TWO_JOKERS, roles: { [user.account.uuid]: 'DOCTOR' } });
        const dialog = revealDialog(user.page);
        await expect(dialog).toContainText('의사', { timeout: 20000 });
        await expect(dialog).not.toContainText('동료 광대');
    });

    test('광대가 하나뿐인 판에서 내가 광대면 → 동료 광대 칸이 없음 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 4, roles: { [user.account.uuid]: 'JOKER' } });
        const dialog = revealDialog(user.page);
        await expect(dialog).toContainText('광대', { timeout: 20000 });
        await expect(dialog).not.toContainText('동료 광대');
    });

    test('두 사람이 둘 다 광대면 → 서로 상대 닉네임을 동료 광대로 봄 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        await table.setup({ humans: [user, p2], bots: 4, settings: TWO_JOKERS, roles: { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'JOKER' } });
        await expect(revealDialog(user.page).getByRole('listitem')).toHaveText([p2.account.nickname], { timeout: 20000 });
        await expect(revealDialog(p2.page).getByRole('listitem')).toHaveText([user.account.nickname], { timeout: 20000 });
    });

    test('한 사람은 광대·한 사람은 시민이면 → 시민 화면에는 광대 닉네임이 동료로 안 나옴 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        await table.setup({ humans: [user, p2], bots: 4, settings: TWO_JOKERS, roles: { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'CITIZEN' } });
        await expect(revealDialog(user.page)).toContainText('동료 광대', { timeout: 20000 });
        await expect(revealDialog(p2.page)).toContainText('시민', { timeout: 20000 });
        await expect(revealDialog(p2.page)).not.toContainText('동료 광대');
    });

    test('광대 둘인 판에서 다시 보기를 누르면 → 동료 광대 목록도 다시 보임 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await table.setup({ humans: [user], bots: 5, settings: TWO_JOKERS, roles: ({ bots }) => ({ [me]: 'JOKER', [bots[1].account.uuid]: 'JOKER' }) });
        await L.closeReveal(user.page);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        await expect(revealDialog(user.page).getByRole('listitem')).toHaveText([t.bots[1].nickname]);
    });

    test('직접 구성(광대 2·의사 1·경비원 1) 7명 판에서 광대면 → 동료 광대 한 명만 보임 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await table.setup({ humans: [user], bots: 6, settings: L.customRoles({ JOKER: 2, DOCTOR: 1, GUARD: 1 }), roles: ({ bots }) => ({ [me]: 'JOKER', [bots[3].account.uuid]: 'JOKER' }) });
        await expect(revealDialog(user.page).getByRole('listitem')).toHaveText([t.bots[3].nickname], { timeout: 20000 });
    });
});

test.describe('역할 공개 단계 화면', () => {
    test('역할 공개 단계에는 → 진행 바가 제 0일이고 채팅 틀 안 타이머가 없음 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await L.closeReveal(user.page);
        await expect(user.page.getByLabel('제 0일 시간 흐름')).toBeVisible();
        await expect(user.page.getByRole('timer')).toHaveCount(0);
    });

    test('역할 공개 단계에 다른 사람 카드를 누르면 → 행동 메뉴가 안 뜸 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 2 });
        await L.closeReveal(user.page);
        await L.card(user.page, t.bots[0].nickname).click();
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toHaveCount(0);
    });

    test('역할 공개 단계에는 → 투표 시작 준비·기권 버튼이 없음 @game', async ({ user, table }) => {
        await table.setup({ humans: [user], bots: 1 });
        await L.closeReveal(user.page);
        await expect(user.page.getByRole('button', { name: '투표 시작 준비' })).toHaveCount(0);
        await expect(user.page.getByRole('button', { name: '기권' })).toHaveCount(0);
    });

    test('역할 공개 단계에 봇이 채팅을 보내면 → 서버가 거절함 (낮이 아님) @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 1 });
        const r = await L.botChat(t, t.bots[0], '역할 공개 중 말');
        expect(r.ok).toBe(false);
        await L.closeReveal(user.page);
        await expect(L.chatLog(user.page)).not.toContainText('역할 공개 중 말');
    });

    test('판에 들어오면 → 보드에 모든 참가자 카드가 보이고 내 카드에는 \'나\' 표시 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4 });
        await L.closeReveal(user.page);
        for (const bot of t.bots) await expect(L.card(user.page, bot.nickname)).toBeVisible();
        await expect(L.selfCard(user.page, user.account.nickname)).toBeVisible();
        await expect(L.selfCard(user.page, user.account.nickname).getByLabel('본인')).toHaveText('나');
    });
});
