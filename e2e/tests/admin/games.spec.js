// 관리자 지난 판 브라우저 시험 (AD-232): 회원 UUID로 판 찾기 → 판 하나 → 참가자·직업·승패·점검으로 끝남
// 프로젝트 admin (1280×800), 판 줄은 시험이 DB에 바로 넣고 끝나면 지움
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

test.describe('관리자 지난 판', () => {
    test('AD-232: 판 찾기 → 상세 (점검으로 끝난 판)', async ({ page, accounts }) => {
        const player = await accounts.create();
        const gameId = crypto.randomUUID();
        try {
            await query(`INSERT INTO game_results (id, room_id, started_at, ended_at, winner, win_reason, day_index, player_count, settings, completed)
                VALUES (?, NULL, UTC_TIMESTAMP() - INTERVAL 15 MINUTE, UTC_TIMESTAMP() - INTERVAL 3 MINUTE, 'NONE', 'MAINTENANCE', 2, 1, NULL, 0)`, [gameId]);
            await query(`INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, won, is_alive, death_reason)
                VALUES (?, ?, ?, 'DOCTOR', 'CITIZEN', NULL, 1, NULL)`, [gameId, player.uuid, player.nickname]);

            await loginAsAdmin(page, await createAdmin());
            await page.goto('/games');
            await page.getByLabel('회원 UUID').fill(player.uuid);
            await page.getByRole('button', { name: '찾기' }).click();
            await expect(page).toHaveURL(new RegExp(`userUuid=${player.uuid}`));

            const rows = page.getByRole('table', { name: '지난 판 목록' }).locator('tbody tr');
            await expect(rows).toHaveCount(1);
            await expect(rows.first()).toContainText('점검으로 끝남');
            await rows.first().getByRole('link').click();

            await expect(page).toHaveURL(new RegExp(`/games/${gameId}`));
            await expect(page.getByText('점검으로 끝난 판이라 승패·보상·벌점이 없어요.')).toBeVisible();
            await expect(page.getByText('12분 0초')).toBeVisible();
            const playerRow = page.getByRole('table', { name: '참가자' }).getByRole('row').filter({ hasText: player.nickname });
            await expect(playerRow).toContainText('주치의');
            await expect(playerRow).toContainText('승패 없음');
            await playerRow.getByRole('link', { name: player.nickname }).click();
            await expect(page).toHaveURL(new RegExp(`/members/${player.uuid}`));
        } finally {
            await query('DELETE FROM game_result_players WHERE game_id = ?', [gameId]);
            await query('DELETE FROM game_results WHERE id = ?', [gameId]);
        }
    });
});
