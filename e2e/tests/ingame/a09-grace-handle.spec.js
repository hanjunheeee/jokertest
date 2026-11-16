'use strict';

// 끊겨서 판에서 빠진 사람 브라우저 시험 (PC) — 산 채로 탭을 닫고 60초(손잡이)가 지난 뒤 다시 판 화면을 열면 까닭 글 + 방 목록
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-031~035·117 (PC 줄) — 60초 규칙 자체는 a09-realtime이 진짜로 기다려 봄, 여기는 손잡이
const { test, expect, ui } = require('../../helpers/fixtures');
const K = require('./_a09-simple-kit');

// 탭 닫음 → 서버가 끊김을 앎 → 60초 손잡이 → 판에서 빠진 것 확인 → 같은 브라우저 새 탭
async function forfeitAndReopen(t, user) {
    const me = K.U(user);
    const since = Date.now();
    await user.page.close();
    await K.droppedAt(t, me, since);
    await K.expire(t, me);
    await expect.poll(async () => (await t.player(me))?.isParticipating, { timeout: 10_000, message: '판에 참여 중인지' }).toBe(false);
    return user.context.newPage();
}

// 새 탭에서 판 화면을 열면 까닭 글이 뜨고 방 목록으로 감
async function expectForfeitNotice(tab) {
    const text = await ui.captureAlert(tab, () => tab.goto('/ingame'), { timeoutMs: 20_000 });
    expect(text).toBe(K.FORFEIT_TEXT);
    await expect(tab).toHaveURL(/\/multiplay/, { timeout: 20_000 });
    await expect(tab.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
}

// 끊긴 단계마다: 판 인원 · 그때 서버 단계(낮은 토론·투표까지) · 그 단계까지 가는 법
const CASES = [
    { no: 'A09-E-031', n: 5, label: '역할 확인', phase: 'ROLE_REVEAL', go: async () => {} },
    { no: 'A09-E-032', n: 6, label: '토론', phase: 'DAY', dayPhase: 'DAY_DISCUSSION', go: async (t) => { await K.toDay(t); } },
    { no: 'A09-E-033', n: 7, label: '투표', phase: 'DAY', dayPhase: 'DAY_VOTE', go: async (t) => { await K.toVote(t); } },
    {
        // 재판: 봇 표로 시민 봇 하나를 피고로 세움 (끊기는 나는 피고가 아닌 투표자)
        no: 'A09-E-034', n: 8, label: '재판', phase: 'TRIBUNAL',
        go: async (t) => { await K.voteOut(t, K.U(K.botOf(t, await t.state(), 'CITIZEN'))); },
    },
    { no: 'A09-E-035', n: 10, label: '밤', phase: 'NIGHT', go: async (t) => { await K.toNight(t, 1); } },
];

for (const c of CASES) {
    const smoke = c.no === 'A09-E-032' ? ' @smoke' : '';
    test(`${c.no} PC ${c.n}명 판 ${c.label} 중 산 채로 탭 닫음 → 60초(손잡이) 뒤 다시 판 화면 → 까닭 글 + 방 목록 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await K.seat(table, user, { n: c.n });
        await c.go(t);
        const s = await t.state();
        expect(s.phase, '끊기는 순간 단계').toBe(c.phase);
        if (c.dayPhase) expect(s.dayPhase, '끊기는 순간 낮 단계').toBe(c.dayPhase);
        const tab = await forfeitAndReopen(t, user);
        await expectForfeitNotice(tab);
    });
}

test('A09-E-117 PC 6명 판, 60초(손잡이)로 빠진 사람이 판 주소를 직접 열기 → 방 목록 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await K.seat(table, user, { n: 6 });
    await K.toDay(t);
    const tab = await forfeitAndReopen(t, user);
    // 알림 창이 떠도 닫고 어디로 가는지만 봄
    tab.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await tab.goto('/ingame');
    await expect(tab).toHaveURL(/\/multiplay/, { timeout: 20_000 });
    await expect(tab.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    expect((await t.player(K.U(user))).isParticipating, '판에 다시 안 들어감').toBe(false);
});
