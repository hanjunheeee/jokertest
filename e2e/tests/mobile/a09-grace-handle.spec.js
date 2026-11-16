'use strict';

// 모바일 끊겨서 판에서 빠진 사람 브라우저 시험 — 산 채로 탭을 닫고 60초(손잡이)가 지난 뒤 다시 판 화면을 열면 까닭 글(안내 창) + 방 목록
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-036·037 (모바일 줄) — 60초는 손잡이로 끝냄
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../ingame/_a09-simple-kit');

// 끊긴 단계: 판 인원 · 그때 서버 단계 · 그 단계까지 가는 법
const CASES = [
    { no: 'A09-E-036', n: 6, label: '토론', phase: 'DAY', go: async (t) => { await K.toDay(t); } },
    { no: 'A09-E-037', n: 8, label: '밤', phase: 'NIGHT', go: async (t) => { await K.toNight(t, 1); } },
];

CASES.forEach((c, i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${c.no} 모바일 ${c.n}명 판 ${c.label} 중 산 채로 탭 닫음 → 60초(손잡이) 뒤 다시 판 화면 → 까닭 글 + 방 목록 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const me = K.U(user);
        const t = await K.seat(table, user, { n: c.n });
        await c.go(t);
        expect((await t.state()).phase, '끊기는 순간 단계').toBe(c.phase);

        const since = Date.now();
        await user.page.close();
        await K.droppedAt(t, me, since);
        await K.expire(t, me);
        await expect.poll(async () => (await t.player(me))?.isParticipating, { timeout: 10_000, message: '판에 참여 중인지' }).toBe(false);

        // 같은 브라우저 새 탭에서 판 화면을 엶 → 안내 창 글이 읽히고, 닫으면 방 목록
        const tab = await user.context.newPage();
        const text = await ui.captureAlert(tab, () => tab.goto('/ingame'), { timeoutMs: 20_000, close: false });
        expect(text).toBe(K.FORFEIT_TEXT);
        await expectReadable(K.noticeText(tab));
        await K.closeNotice(tab);
        await expect(tab).toHaveURL(/\/multiplay/, { timeout: 20_000 });
        await expect(tab.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    });
});
