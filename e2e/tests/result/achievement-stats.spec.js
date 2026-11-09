// 판 뒤 기록 반영 시험: 업적 지급(알림·신호·서고 진행도·보상 잔액), 역할 통계(서고 직업 탭), 직업 랭킹(판 많이 한 사람이 위)
// 빈칸찾기 중 6·7·11·12, 하 1 — 지난 판 기록은 시험 DB에 바로 넣어 만들고(3판 업적·10판 랭킹), 마지막 판만 진짜로 돌림
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { query, sqlTime } = require('../../helpers/db');
const h = require('../room/roomHelpers');
const st = require('../store/store-tools');

const PRODUCTION_SETTINGS = JSON.stringify({ gameSource: { v: 1, value: 'production' } });
const menu = (page) => page.getByRole('navigation', { name: '로비 메뉴' });

/**
 * 끝난 판 기록 넣기 (판 하나에 그 사람 한 줄), 넣은 판 id 목록 돌려줌 → 시험 끝에 cleanupGames로 지움
 * @param {{uuid:string,nickname:string}} account
 * @param {{count:number, role?:string, won?:boolean}} o
 */
async function seedGames(account, { count, role = 'JOKER', won = true }) {
    const ids = [];
    const ended = sqlTime(Date.now() - 3600e3);
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID();
        await query(
            'INSERT INTO game_results (id, room_id, started_at, ended_at, winner, win_reason, day_index, player_count, settings, completed) VALUES (?, NULL, ?, ?, ?, NULL, 2, 5, ?, 1)',
            [id, ended, ended, role === 'JOKER' ? 'JOKER' : 'CITIZEN', PRODUCTION_SETTINGS],
        );
        await query(
            'INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, won, is_alive, death_reason) VALUES (?, ?, ?, ?, ?, ?, 1, NULL)',
            [id, account.uuid, account.nickname, role, role === 'JOKER' ? 'JOKER' : 'CITIZEN', won ? 1 : 0],
        );
        ids.push(id);
    }
    return ids;
}

async function cleanupGames(ids) {
    if (ids.length === 0) return;
    await query('DELETE FROM game_result_players WHERE game_id IN (?)', [ids]);
    await query('DELETE FROM game_results WHERE id IN (?)', [ids]);
}

// 브라우저가 받은 소켓 신호 이름 모으기 (판 화면으로 갈 때 새로 붙는 소켓부터 다 봄)
function watchSocketEvents(page) {
    const seen = [];
    page.on('websocket', (ws) => {
        ws.on('framereceived', ({ payload }) => {
            const text = typeof payload === 'string' ? payload : payload.toString();
            const m = /^\d+\["([a-z_]+)",?(.*)\]$/s.exec(text);
            if (m) seen.push({ event: m[1], body: m[2] });
        });
    });
    return seen;
}

// 결과 화면에서 로비로 (나가기 확인 창 받음)
async function resultToLobby(page) {
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '로비로' }).click();
    await expect(page).toHaveURL(/\/lobby$/);
}

// 서고 → 초대받은 자들 → 직업 탭
async function openJobTab(page, roleTab) {
    await menu(page).getByRole('button', { name: '기억의 서고' }).click();
    await ui.skipIntro(page);
    await page.getByRole('button', { name: '초대받은 자들' }).click();
    await page.getByRole('tab', { name: roleTab }).click();
    await expect(page.getByRole('heading', { name: `직업 [${roleTab}]` })).toBeVisible();
}

test.describe('업적 지급 @game', () => {
    test('지난 판 2개 + 이번 판으로 3판을 채우면 → 로비 알림에 "업적 달성", achievement_granted 신호, 서고 기록 I 이야기가 열림', async ({ user, table }) => {
        const seeded = await seedGames(user.account, { count: 2, role: 'CITIZEN', won: false });
        try {
            const seen = watchSocketEvents(user.page);
            await h.playToResult({ user, table, kind: 'jokerWin' });
            await expect.poll(() => seen.filter((s) => s.event === 'achievement_granted').map((s) => JSON.parse(s.body).achievementId), { timeout: 20000 })
                .toContain('record-1-masquerade');
            await resultToLobby(user.page);
            await user.page.getByRole('button', { name: /^알림/ }).click();
            const dialog = user.page.getByRole('dialog', { name: '알림' });
            await expect(dialog.getByRole('listitem').filter({ hasText: '업적 달성' })).toBeVisible({ timeout: 15000 });
            await user.page.keyboard.press('Escape');
            await menu(user.page).getByRole('button', { name: '기억의 서고' }).click();
            await ui.skipIntro(user.page);
            // 깬 기록은 진행도 칸 대신 이야기 글이 열림 (깨기 전엔 '0/3회 완료' 칸)
            await expect(user.page.getByRole('heading', { name: /기록 I/ })).toBeVisible();
            await expect(user.page.getByText('그날 밤, 무도회의 흥을 돋우기 위해', { exact: false })).toBeVisible();
            await expect(user.page.getByText(/\d\/3회 완료/)).toHaveCount(0);
            const grants = await query('SELECT achievement_id FROM achievement_grants WHERE user_id = ?', [user.account.uuid]);
            expect(grants.map((g) => g.achievement_id)).toEqual(['record-1-masquerade']);
        } finally {
            await cleanupGames(seeded);
        }
    });

    test('업적 보상이 들어가면 → account_cache_invalidated(economy) 신호가 오고 새로 고치지 않고 간 상점 잔액이 골드 50·다이아 50', async ({ user, table }) => {
        const seeded = await seedGames(user.account, { count: 2, role: 'CITIZEN', won: false });
        try {
            const seen = watchSocketEvents(user.page);
            await h.playToResult({ user, table, kind: 'jokerWin' });
            await expect.poll(() => seen.filter((s) => s.event === 'account_cache_invalidated').flatMap((s) => JSON.parse(s.body).scopes ?? []), { timeout: 20000 })
                .toContain('economy');
            await resultToLobby(user.page);
            await menu(user.page).getByRole('button', { name: '상점' }).click();
            await expect(user.page).toHaveURL(/\/store$/);
            await expect(st.balance(user.page, '골드', 50)).toBeVisible({ timeout: 15000 });
            await expect(st.balance(user.page, '다이아', 50)).toBeVisible();
        } finally {
            await cleanupGames(seeded);
        }
    });
});

test.describe('역할 통계·랭킹', () => {
    test('광대로 한 판 이기고 서고 직업 탭(광대)에 가면 → 플레이 횟수 1·승률 100, 안 해 본 귀족은 0 @game', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await resultToLobby(user.page);
        await openJobTab(user.page, '광대');
        await expect(user.page.getByRole('row', { name: '플레이 횟수 1' })).toBeVisible({ timeout: 15000 });
        await expect(user.page.getByRole('row', { name: /^승률 100/ })).toBeVisible();
        await user.page.getByRole('tab', { name: '귀족' }).click();
        await expect(user.page.getByRole('heading', { name: '직업 [귀족]' })).toBeVisible();
        await expect(user.page.getByRole('row', { name: '플레이 횟수 0' })).toBeVisible();
    });

    test('광대 13판 다 이긴 사람·12판 다 이긴 사람이 있으면 → 광대 랭킹에서 판 많은 사람이 위, 9판 한 사람은 안 보임', async ({ user, accounts }) => {
        const more = await accounts.create();
        const fewer = await accounts.create();
        const tooFew = await accounts.create();
        const seeded = [
            ...await seedGames(more, { count: 13 }),
            ...await seedGames(fewer, { count: 12 }),
            ...await seedGames(tooFew, { count: 9 }),
        ];
        try {
            await openJobTab(user.page, '광대');
            const rows = user.page.getByRole('row');
            const moreRow = rows.filter({ hasText: more.nickname });
            const fewerRow = rows.filter({ hasText: fewer.nickname });
            await expect(moreRow).toBeVisible({ timeout: 15000 });
            await expect(moreRow).toContainText('13');
            await expect(fewerRow).toContainText('12');
            await expect(rows.filter({ hasText: tooFew.nickname })).toHaveCount(0);
            const texts = await rows.allInnerTexts();
            const at = (name) => texts.findIndex((t) => t.includes(name));
            expect(at(more.nickname)).toBeLessThan(at(fewer.nickname));
        } finally {
            await cleanupGames(seeded);
        }
    });
});
