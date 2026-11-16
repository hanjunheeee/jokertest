'use strict';

// 탈주 막힘이 끝난 뒤 관리자 회원 상세 상태 브라우저 시험 (관리자 PC 화면 + 사람 1명 판) — 막힘 중 → 끝남
// 목록 A09-끊김-나가기-탈주.md A09-H-047 — 5분을 진짜로 기다리는 것은 a09-desertion-real(H-016) 하나만, 여기선 그 줄 시각을 5분 당겨 넣음(관리자 상세는 DB 막힘 끝으로 상태를 정함) / 모이는지만: npx playwright test --list tests/admin/a09-desertion-real.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U } = H;

test('A09-H-047 5명 판(사람 1 + 봇 4) 산 채로 나간 계정, 관리자 상세 상태 "막힘 중" → 막힘이 끝나면(그 줄 시각을 5분 당김) "끝남" @game @hard @smoke', async ({ browser, players, table }) => {
    test.setTimeout(240_000);
    const a = await players.add({ mobile: false });
    const t = await H.seat(table, [a], { n: 5 });
    await K.toDay(t);
    await K.leaveAlive(a.page);
    await expect.poll(async () => (await H.desertionRows(U(a))).length, { timeout: 15_000, message: '탈주 줄' }).toBe(1);

    const admin = await H.openAdmin(browser);
    try {
        const before = await H.desertionCells(await H.openDesertions(admin.page, U(a)), t.gameId);
        expect(before.state).toBe('막힘 중');
        // 5분이 지난 것과 같게: 탈주 시각·막힘 끝을 함께 5분 1초 앞으로 (막힘 끝이 지금보다 앞)
        await query(
            'UPDATE game_desertions SET deserted_at = deserted_at - INTERVAL 301 SECOND, blocked_until = blocked_until - INTERVAL 301 SECOND WHERE user_id = ? AND game_id = ?',
            [U(a), t.gameId],
        );
        const after = await H.desertionCells(await H.openDesertions(admin.page, U(a)), t.gameId);
        expect(after.state).toBe('끝남');
        expect(after.reason).toBe('산 채로 나감');
        await expectReadable(after.row.getByRole('cell', { name: '끝남', exact: true }));
    } finally {
        await admin.close();
    }
});
