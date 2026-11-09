// 모바일 밤: "밤 · 같은 직업끼리" 띠·같은 직업 채팅(붉은 말풍선)·밤 차례 안내·밤 행동 시트(암살·보호·조사)·건너뛰기·밤 결과
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toNight, goPhase, say, botSay, botNightSay, clearOverlays, bgColor, jokerBot } = require('./_talk');

const CUSTOM_ALL = { roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } };
const jokerMe = (user) => ({ [user.account.uuid]: 'JOKER' });
const citizenMe = (user) => ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' });
const body = (li) => li.locator('p.whitespace-pre-wrap');

async function nightAs(table, user, roles, o = {}) {
    const t = await startTalkGame(table, user, { bots: 4, roles, ...o });
    t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    await toNight(t, user.page);
    return t;
}

async function openSheet(page, nickname) {
    await talk.slot(page, nickname).click();
    const sheet = page.getByRole('dialog', { name: nickname });
    await expect(sheet).toBeVisible();
    return sheet;
}

test.describe('밤 채팅방', () => {
    test('광대인 내가 밤을 맞으면 → 채팅방 위에 "밤 · 같은 직업끼리" 띠가 보임 @game', async ({ user, table }) => {
        await nightAs(table, user, jokerMe(user));
        await expect(talk.nightBanner(user.page)).toBeVisible();
        await expect(talk.deadBanner(user.page)).toHaveCount(0);
    });

    test('시민인 나도 밤엔 → "밤 · 같은 직업끼리" 띠가 보임 (시민끼리 채팅) @game', async ({ user, table }) => {
        await nightAs(table, user, citizenMe(user));
        await expect(talk.nightBanner(user.page)).toBeVisible();
    });

    test('낮엔 → "밤 · 같은 직업끼리" 띠가 없음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await expect(talk.nightBanner(user.page)).toHaveCount(0);
    });

    test('밤에 내가 말하면 → 붉은 같은 직업 말풍선(내 것)으로 오른쪽에 보임 @game', async ({ user, table }) => {
        await nightAs(table, user, jokerMe(user));
        await say(user.page, '밤의 내 말');
        expect(await bgColor(body(talk.mine(user.page).filter({ hasText: '밤의 내 말' })))).toBe('rgb(122, 36, 24)');
    });

    test('광대 둘인 판 밤에 동료 광대 봇이 말하면 → 내 화면 왼쪽에 붉은 말풍선으로 보임 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, ({ bots }) => ({ [user.account.uuid]: 'JOKER', [bots[1].account.uuid]: 'JOKER' }), { settings: { jokerCount: 2 } });
        await botNightSay(t, 1, '동료의 밤 말');
        const li = talk.others(user.page).filter({ hasText: '동료의 밤 말' });
        await expect(li).toBeVisible();
        expect(await bgColor(body(li))).toBe('rgb(74, 20, 20)');
        await expect(li.locator('p.truncate')).toHaveText(t.bots[1].nickname);
    });

    test('밤에 광대 봇이 같은 직업 채팅을 해도 → 시민인 내 화면엔 안 보임 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, citizenMe(user));
        await botNightSay(t, 0, '광대만의 비밀');
        await botNightSay(t, 1, '시민끼리 말');
        await expect(talk.others(user.page).filter({ hasText: '시민끼리 말' })).toBeVisible();
        await expect(talk.log(user.page)).not.toContainText('광대만의 비밀');
    });

    test('밤이 되면 → 낮에 오간 말은 채팅방에서 빠지고 밤 말만 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: jokerMe(user) });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await botSay(t, 0, '낮의 봇 말');
        await expect(talk.others(user.page).filter({ hasText: '낮의 봇 말' })).toBeVisible();
        await toNight(t, user.page);
        await expect(talk.log(user.page)).not.toContainText('낮의 봇 말');
    });

    test('밤이 지나 낮이 되면 → "밤 · 같은 직업끼리" 띠가 사라지고 밤 말도 안 보임 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, jokerMe(user));
        await say(user.page, '밤에만 보일 말');
        await goPhase(t, user.page, (s) => s.phase === 'DAY' && s.dayIndex === 2, { line: '제 2일' });
        await expect(talk.nightBanner(user.page)).toHaveCount(0);
        await expect(talk.log(user.page)).not.toContainText('밤에만 보일 말');
    });

});

test.describe('밤 차례 안내', () => {
    test('의사인 내 밤 차례가 오면 → "의사의 시간입니다" 밤 역할 안내 창이 뜸 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, settings: CUSTOM_ALL, roles: { [user.account.uuid]: 'DOCTOR' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR');
        const dialog = user.page.getByRole('dialog', { name: '밤 역할 안내' });
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await expect(dialog).toContainText('의사의 시간입니다');
    });

    test('밤 역할 안내 창은 → 아무것도 안 눌러도 잠시 뒤 저절로 닫힘 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, settings: CUSTOM_ALL, roles: { [user.account.uuid]: 'DOCTOR' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR');
        const dialog = user.page.getByRole('dialog', { name: '밤 역할 안내' });
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await expect(dialog).toHaveCount(0, { timeout: 8000 });
    });

    test('광대인 내 밤 차례가 밤 첫 차례로 오면 → 단계 전환 안내를 닫은 뒤 "광대의 시간입니다" 창이 뜸 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: jokerMe(user) });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await t.advanceUntil('NIGHT');
        const notice = user.page.getByRole('dialog', { name: '단계 전환 안내' });
        await expect(notice).toBeVisible({ timeout: 15000 });
        await notice.getByRole('button', { name: '확인' }).click();
        const dialog = user.page.getByRole('dialog', { name: '밤 역할 안내' });
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog).toContainText('광대의 시간입니다');
    });

    test('시민인 내겐 밤이 와도 → 밤 역할 안내 창이 안 뜸 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await expect(user.page.getByRole('dialog', { name: '밤 역할 안내' })).toHaveCount(0);
    });
});

test.describe('밤 행동 시트', () => {
    test('광대인 내 밤 차례에 시민 칸을 누르면 → 시트에 "암살"이 켜져 있음 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, jokerMe(user));
        const sheet = await openSheet(user.page, t.bots[1].nickname);
        await expect(sheet.getByRole('menuitem', { name: '암살' })).toBeEnabled();
    });

    test('광대 둘인 판에서 "암살"을 고르면 → 시트가 닫히고 다시 열면 "취소하기"로 바뀜 (동료가 아직 안 골라 밤이 이어짐) @game', async ({ user, table }) => {
        const t = await nightAs(table, user, ({ bots }) => ({ [user.account.uuid]: 'JOKER', [bots[1].account.uuid]: 'JOKER' }), { settings: { jokerCount: 2 } });
        await (await openSheet(user.page, t.bots[2].nickname)).getByRole('menuitem', { name: '암살' }).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
        await expect((await openSheet(user.page, t.bots[2].nickname)).getByRole('menuitem', { name: '취소하기' })).toBeEnabled();
    });

    test('광대 둘인 판에서 동료 광대 칸을 누르면 → 지목할 수 없어 시트가 안 뜸 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, ({ bots }) => ({ [user.account.uuid]: 'JOKER', [bots[1].account.uuid]: 'JOKER' }), { settings: { jokerCount: 2 } });
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('광대 둘인 판에서 "건너뛰기"를 누르면 → 건너뛰기 버튼이 꺼짐 @game', async ({ user, table }) => {
        await nightAs(table, user, ({ bots }) => ({ [user.account.uuid]: 'JOKER', [bots[1].account.uuid]: 'JOKER' }), { settings: { jokerCount: 2 } });
        const skip = user.page.getByRole('button', { name: '건너뛰기' });
        await skip.click();
        await expect(skip).toBeDisabled();
    });

    test('혼자인 광대가 "건너뛰기"를 누르면 → 밤 행동이 끝나 아침(제 2일)으로 넘어감 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, jokerMe(user));
        await user.page.getByRole('button', { name: '건너뛰기' }).click();
        await expect.poll(async () => (await t.state()).dayIndex, { timeout: 20000 }).toBe(2);
        await expect(talk.phaseLine(user.page)).toContainText('제 2일', { timeout: 15000 });
    });

    test('시민인 내겐 밤에 → 건너뛰기가 없고 남의 칸을 눌러도 시트가 안 뜸 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, citizenMe(user));
        await expect(user.page.getByRole('button', { name: '건너뛰기' })).toHaveCount(0);
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('광대인 내가 봇을 암살하고 밤이 끝나면 → 아침 채팅방에 그 봇 죽음 줄이 뜸 @game', async ({ user, table }) => {
        const t = await nightAs(table, user, jokerMe(user));
        const victim = t.bots[2];
        await (await openSheet(user.page, victim.nickname)).getByRole('menuitem', { name: '암살' }).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
        await t.advanceUntil((s) => s.players.find((p) => p.uuid === victim.account.uuid)?.alive === false, { stepDelayMs: 1500 });
        await expect(talk.system(user.page).filter({ hasText: `${victim.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 30000 });
        await clearOverlays(user.page);
    });

    test('의사인 내 밤 차례에 남의 칸을 누르면 → 시트에 "보호"가 켜져 있음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, settings: CUSTOM_ALL, roles: { [user.account.uuid]: 'DOCTOR' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await goPhase(t, user.page, (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR', { line: '밤 의사' });
        await expect((await openSheet(user.page, t.bots[1].nickname)).getByRole('menuitem', { name: '보호' })).toBeEnabled();
    });

    test('경비원인 내가 광대 봇을 조사하면 → 밤 조사 결과 창이 뜸 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, settings: CUSTOM_ALL, roles: { [user.account.uuid]: 'GUARD' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        const joker = await jokerBot(t);
        await goPhase(t, user.page, (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'GUARD', { line: '밤 경비원' });
        await (await openSheet(user.page, joker.nickname)).getByRole('menuitem', { name: '조사' }).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2, { stepDelayMs: 1500 });
        const result = user.page.getByRole('dialog', { name: '밤 조사 결과' }).or(user.page.getByRole('dialog', { name: '알림', exact: true }));
        await expect(result.first()).toBeVisible({ timeout: 20000 });
        await expect(result.first()).toContainText(joker.nickname);
    });

    test('마녀사냥꾼인 나는 첫 밤엔 → 내 밤 차례가 오지 않고 남의 칸을 눌러도 시트가 안 뜸 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, settings: CUSTOM_ALL, roles: { [user.account.uuid]: 'WITCH_HUNTER' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
        const turns = new Set();
        await t.advanceUntil((g) => { if (g.phase === 'NIGHT') turns.add(g.nightTurnRole); return g.phase === 'DAY' && g.dayIndex === 2; });
        expect([...turns]).not.toContain('WITCH_HUNTER');
    });
});
