'use strict';

// 결과 화면에서 한 사람만 새로고침하는 어려운 브라우저 시험 (PC, 사람 2명) — 새로고침한 사람은 결과를 못 봄, 다른 사람 결과 화면은 그대로
// 목록 A09-끊김-나가기-탈주.md A09-H-043 (결과 화면 나머지는 A08) — 모이는지만: npx playwright test --list tests/result/a09-result-refresh.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { waitResult } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U } = H;

test('A09-H-043 6명 판(사람 2 + 봇 4) 결과 화면에서 ㄴ 새로고침 → ㄴ "게임 결과를 확인할 수 없습니다" + "로비로 돌아가기", ㄱ 결과 화면 그대로 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    // 광대 봇 처형 → 시민 승 (봇 셋만으로는 기권보다 안 많아서 ㄱ·ㄴ도 화면으로 찍음)
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker), { voters: [a, b] });
    expect(end.phase).toBe('ENDED');
    for (const p of [a, b]) {
        await K.pastExpulsion(p.page);
        await waitResult(p.page);
    }

    await b.page.reload();
    await expectReadable(b.page.getByText(H.TEXT.resultGone, { exact: true }));
    await expectReadable(b.page.getByRole('button', { name: '로비로 돌아가기' }));
    // ㄱ은 그대로 결과 화면
    await expect(a.page).toHaveURL(/\/gameresult/);
    await expectReadable(a.page.getByRole('button', { name: '대기방으로' }));
    await expect(a.page.getByRole('region', { name: '가면무도회 참가자 정체' })).toBeVisible();
});
