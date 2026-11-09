// 내 진행 상태 신호(session_self_progress) 시험: 낮 토론에서 준비를 누르면 나한테만 내 준비 상태가 오고 화면 버튼이 따라감
// 빈칸찾기 하 12 — 브라우저가 받은 소켓 신호를 같이 봄 (남의 준비는 내 신호에 안 섞임)
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

// 브라우저가 받은 session_self_progress 내용 모으기 (판 화면 갈 때 새로 붙는 소켓부터)
function watchSelfProgress(page) {
    const seen = [];
    page.on('websocket', (ws) => {
        ws.on('framereceived', ({ payload }) => {
            const text = typeof payload === 'string' ? payload : payload.toString();
            const m = /^\d+\["session_self_progress",(.*)\]$/s.exec(text);
            if (m) seen.push(JSON.parse(m[1]));
        });
    });
    return seen;
}

async function dayTable(table, user) {
    const t = await table.setup({
        humans: [user], bots: 4, settings: { dayDiscussionTime: 150 },
        roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }),
    });
    await L.toDay(t);
    return t;
}

test.describe('내 진행 상태 신호', () => {
    test('투표 시작 준비를 누르면 → 이 판·지금 낮 번호로 isDayVoteReady:true 신호가 오고 버튼이 "준비 완료" @game', async ({ user, table }) => {
        const seen = watchSelfProgress(user.page);
        const t = await dayTable(table, user);
        const before = seen.length;
        await user.page.getByRole('button', { name: '투표 시작 준비' }).click();
        await expect.poll(() => seen.slice(before).some((p) => p.self?.isDayVoteReady === true), { timeout: 10000 }).toBe(true);
        const mine = seen.slice(before).find((p) => p.self?.isDayVoteReady === true);
        const s = await t.state();
        expect(mine.gameId).toBe(t.gameId);
        expect(mine.phase).toBe('DAY');
        expect(mine.dayIndex).toBe(s.dayIndex);
        expect(Number.isInteger(mine.selfProgressSeq)).toBe(true);
        await expect(user.page.getByRole('button', { name: '준비 완료' })).toBeDisabled();
    });

    test('봇들이 준비해도 → 내 신호는 늘 내 것(아직 준비 안 함)만, 내 버튼도 그대로 켜져 있음 @game', async ({ user, table }) => {
        const seen = watchSelfProgress(user.page);
        const t = await dayTable(table, user);
        const before = seen.length;
        for (const bot of t.bots.slice(0, 2)) await bot.request('ready_for_day_vote', { gameId: t.gameId });
        await L.sleep(800);
        expect(seen.slice(before).every((p) => p.self?.isDayVoteReady !== true)).toBe(true);
        await expect(user.page.getByRole('button', { name: '투표 시작 준비' })).toBeEnabled();
    });
});
