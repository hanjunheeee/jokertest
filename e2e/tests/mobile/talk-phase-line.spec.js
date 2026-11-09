// 모바일 카톡형 단계 줄: 위 줄 오른쪽 "제 N일 · 낮 토론 0:45" 한 줄, 누르면 진행 바 펼침·접기
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toVote, toNight, goPhase } = require('./_talk');

// 단계 줄 끝 남은 시간 "0:28" → 초
async function clockSec(page) {
    const text = await talk.phaseLine(page).innerText();
    const m = text.match(/(\d+):(\d{2})\s*$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

test.describe('단계 줄', () => {
    test('역할 공개 동안엔 → 단계 줄이 "제 0일"이고 남은 시간이 없음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2, closeReveal: false });
        await expect(talk.phaseLine(user.page)).toHaveText(/^제 0일$/);
    });

    test('낮 토론이 되면 → 단계 줄이 "제 1일 · 낮 토론 0:ss" 모양 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await expect(talk.phaseLine(user.page)).toHaveText(/^제 1일·낮 토론\d:\d{2}$/);
        await expect(talk.phaseLine(user.page)).toHaveAttribute('aria-label', '제 1일 낮 토론 진행 바 펼치기');
    });

    test('낮 토론 남은 시간은 → 방 설정(30초) 안쪽에서 1초마다 줄어듦 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        const first = await clockSec(user.page);
        expect(first).toBeGreaterThan(0);
        expect(first).toBeLessThanOrEqual(30);
        await expect.poll(() => clockSec(user.page), { timeout: 5000 }).toBeLessThan(first);
    });

    test('방 토론 시간을 60초로 하면 → 낮 토론 남은 시간이 30초보다 크게 시작함 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2, settings: { dayDiscussionTime: 60 } });
        await toDay(t, user.page);
        expect(await clockSec(user.page)).toBeGreaterThan(40);
    });

    test('남은 시간이 10초 이하가 되면 → 단계 줄 시간 글자가 붉은색으로 바뀜 @game', async ({ user, table }) => {
        test.setTimeout(90_000);
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        const clock = talk.phaseLine(user.page).locator('span.font-mono');
        const before = await clock.evaluate((el) => getComputedStyle(el).color);
        await expect.poll(() => clockSec(user.page), { timeout: 35_000, intervals: [500] }).toBeLessThanOrEqual(10);
        await expect.poll(() => clock.evaluate((el) => getComputedStyle(el).color)).not.toBe(before);
        expect(await clock.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 138, 106)');
    });

    test('낮 투표가 되면 → 단계 줄은 "낮 토론"(진행 바 글이 [낮-토론과 투표])이고 행동 줄이 기권·낮 집계로 바뀜 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: true, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        await expect(talk.phaseLine(user.page)).toContainText('제 1일');
        await expect(talk.phaseLine(user.page)).toContainText('낮 토론');
        await expect(user.page.getByRole('button', { name: '기권' })).toBeVisible();
        await expect(talk.phaseAction(user.page, 'dayVoteResolve')).toHaveText('낮 집계');
    });

    test('광대인 내 밤 차례가 되면 → 단계 줄이 "밤 광대" @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: { [user.account.uuid]: 'JOKER' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await expect(talk.phaseLine(user.page)).toContainText('밤 광대');
    });

    test('시민인 나도 밤 광대 차례에 → 단계 줄이 "밤 광대"로 차례 직업을 보여 줌 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }) });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await expect(talk.phaseLine(user.page)).toContainText('제 1일');
        await expect(talk.phaseLine(user.page)).toContainText('밤 광대');
    });

    test('재판이 열리면 → 단계 줄이 "재판 진행" @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4 });
        const target = t.bots[3].account.uuid;
        t.playBots({ dayVote: target, tribunal: 'skip', night: 'skip' });
        await goPhase(t, user.page, 'TRIBUNAL', { stepDelayMs: 1200 });
        await expect(talk.phaseLine(user.page)).toContainText('재판 진행', { timeout: 15000 });
    });

    test('재판 중에도 → 단계 줄에 재판 남은 시간이 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4 });
        const target = t.bots[3].account.uuid;
        t.playBots({ dayVote: target, tribunal: 'skip', night: 'skip' });
        await goPhase(t, user.page, 'TRIBUNAL', { stepDelayMs: 1200 });
        await expect(talk.phaseLine(user.page)).toContainText('재판 진행', { timeout: 15000 });
        await expect(talk.phaseLine(user.page)).toHaveText(/\d:\d{2}$/, { timeout: 8000 });
    });

    test('밤이 지나 이튿날이 되면 → 단계 줄이 "제 2일 · 낮 토론" @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await goPhase(t, user.page, (s) => s.phase === 'DAY' && s.dayIndex === 2, { line: '제 2일' });
        await expect(talk.phaseLine(user.page)).toContainText('낮 토론');
    });

    test('단계 줄을 누르면 → 진행 바가 펼쳐지고 "[낮-토론과 투표]"와 타이머가 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await talk.phaseLine(user.page).click();
        await expect(talk.phaseLine(user.page)).toHaveAttribute('aria-expanded', 'true');
        await expect(talk.timebarSlot(user.page)).toBeVisible();
        await expect(talk.timebarSlot(user.page).getByText('[낮-토론과 투표]')).toBeVisible();
        await expect(talk.timebarSlot(user.page).getByRole('timer')).toBeVisible();
    });

    test('펼친 단계 줄을 한 번 더 누르면 → 진행 바가 다시 접힘 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await talk.phaseLine(user.page).click();
        await expect(talk.timebarSlot(user.page)).toBeVisible();
        await talk.phaseLine(user.page).click();
        await expect(talk.timebarSlot(user.page)).toBeHidden();
        await expect(talk.phaseLine(user.page)).toHaveAttribute('aria-label', /펼치기$/);
    });

    test('진행 바를 펼친 채 밤이 되면 → 펼친 그대로 "[밤-광대]"로 바뀜 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await talk.phaseLine(user.page).click();
        await toNight(t, user.page);
        await expect(talk.timebarSlot(user.page)).toBeVisible();
        await expect(talk.timebarSlot(user.page).getByText('[밤-광대]')).toBeVisible();
    });

});
