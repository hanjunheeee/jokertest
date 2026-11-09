// 관리자 문의 답 브라우저 시험 (AD-285·286): 답 → 플레이어 알림 뜸 → 누르면 문의 창에 답·"답함" / 꺼진 동안 답 → 로그인하면 알림
// 프로젝트 admin (1280×800), 문의 줄은 플레이어 문의 쓰기와 같은 모양으로 DB에 넣음 (문의 쓰기 화면은 inquiry/inquiry.spec이 봄)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const L = require('../lobby/lobbyHelpers');

const uniq = () => crypto.randomBytes(3).toString('hex');

// 답 기다림 문의 하나 넣기 → 문의 id
async function makeInquiry(account, title) {
    await query(
        "INSERT INTO inquiries (user_id, category, title, body, status, created_at, updated_at) VALUES (?, 'BUG', ?, '투표 때 화면이 멈춰요', 'OPEN', NOW(), NOW())",
        [account.uuid, title],
    );
    const [{ id }] = await query('SELECT id FROM inquiries WHERE user_id = ? AND title = ?', [account.uuid, title]);
    return Number(id);
}

// 관리자 목록 → 제목 눌러 열고 답 보내기
async function replyFromScreen(page, { title, body }) {
    await page.goto('/inquiries');
    await expect(page.getByRole('heading', { name: '문의', level: 1 })).toBeVisible();
    await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.getByLabel('답').fill(body);
    await page.getByRole('button', { name: '답 보내기' }).click();
    await expect(page.getByRole('status').filter({ hasText: '답을 달았어요. 플레이어에게 알림을 보냈어요.' })).toBeVisible();
    await expect(page.getByRole('list', { name: '단 답' })).toContainText(body);
}

test.describe('관리자 문의 답', () => {
    test('AD-285: 관리자 답 → 플레이어 알림 뜸 → 누르면 문의 창에 답·"답함"', async ({ page, players }) => {
        const player = await players.add({ mobile: false });
        await expect(player.page.getByRole('button', { name: '알림 (읽지 않음 1개)' })).toBeVisible();
        const title = `밤에 멈춤 ${uniq()}`;
        const id = await makeInquiry(player.account, title);

        await loginAsAdmin(page, await createAdmin());
        await replyFromScreen(page, { title, body: '고쳤어요. 다시 해 보세요.' });
        await expect(page.getByRole('heading', { name: title })).toBeVisible();
        const [row] = await query('SELECT status FROM inquiries WHERE id = ?', [id]);
        expect(row.status).toBe('ANSWERED');

        // 플레이어: 로비에 있는 채로 배지 늘고, 누르면 문의 창에 답
        await expect(player.page.getByRole('button', { name: '알림 (읽지 않음 2개)' })).toBeVisible({ timeout: 15_000 });
        const dialog = await L.openNotifications(player.page);
        const item = dialog.getByRole('listitem').filter({ hasText: '문의에 답이 왔어요' });
        await expect(item).toContainText(title);
        await L.clickItemAction(item, '문의 답 보기');
        const detail = player.page.getByRole('dialog', { name: '고객센터 문의' }).getByTestId('inquiry-detail');
        await expect(detail).toContainText('고쳤어요. 다시 해 보세요.');
        await expect(detail).toContainText('운영팀');
        await expect(detail).toContainText('답함');
    });

    test('AD-286: 플레이어가 꺼진 동안 답 → 로그인하면 알림 있음', async ({ page, accounts, players }) => {
        const account = await accounts.create();
        const title = `골드 안 들어옴 ${uniq()}`;
        await makeInquiry(account, title);

        await loginAsAdmin(page, await createAdmin());
        await replyFromScreen(page, { title, body: '넣어 드렸어요.' });

        const player = await players.add({ mobile: false, account });
        await expect(player.page.getByRole('button', { name: /^알림 \(읽지 않음/ })).toBeVisible({ timeout: 15_000 });
        const dialog = await L.openNotifications(player.page);
        await expect(dialog.getByRole('listitem').filter({ hasText: '문의에 답이 왔어요' })).toContainText(title);
    });
});
