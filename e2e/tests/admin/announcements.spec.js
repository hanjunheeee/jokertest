// 관리자 공지 브라우저 시험 (AD-095·096): 고른 회원 공지 → 결과 표시 → 플레이어 알림(종)에 뜸 / 접속자 전체 공지 @serial
// 프로젝트 admin (1280×800), 전체 공지는 서버 전체에 걸려 serial에서 돎(관리자 주소는 E2E.adminUrl 직접)
const crypto = require('node:crypto');
const { test, expect, E2E } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const L = require('../lobby/lobbyHelpers');

const uniq = () => crypto.randomBytes(3).toString('hex');
const bell = (page) => page.getByRole('button', { name: /^알림/ });

// 발송 결과 칸 이름표 → 숫자 (예: '받는 사람' → 1)
async function resultNumber(page, label) {
    const box = page.getByRole('status', { name: '발송 결과' });
    const cell = box.locator('div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}`) }) });
    return Number(await cell.locator('dd').innerText());
}

// 공지 화면에서 제목·본문 쓰고 → (고른 사람이면 UUID 넣기) → 확인 → 보내기
async function sendFromScreen(page, { title, body, uuids }) {
    await page.goto('/announcements');
    await expect(page.getByRole('heading', { name: '공지', level: 1 })).toBeVisible();
    await page.getByLabel('제목').fill(title);
    await page.getByLabel('본문').fill(body);
    if (uuids) {
        await page.getByLabel('고른 사람').check();
        for (const uuid of uuids) {
            await page.getByLabel('받을 사람 찾기').fill(uuid);
            await page.getByRole('button', { name: '이 UUID 그대로 넣기' }).click();
        }
        await expect(page.getByText(`고른 사람 ${uuids.length}명`, { exact: true })).toBeVisible();
    } else {
        await page.getByLabel('접속 중 전체').check();
    }
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '이 공지를 보낼까요?' });
    await expect(dialog).toContainText(title);
    await dialog.getByRole('button', { name: '보내기' }).click();
    await expect(page.getByRole('status', { name: '발송 결과' })).toBeVisible();
}

test.describe('관리자 공지', () => {
    test('AD-095: 고른 회원 공지 → 결과(받는 사람·실패·중복) 표시 → 플레이어 알림(종)에 뜸', async ({ page, players }) => {
        const player = await players.add({ mobile: false });
        await expect(player.page.getByRole('button', { name: '알림 (읽지 않음 1개)' })).toBeVisible();

        await loginAsAdmin(page, await createAdmin());
        const title = `점검 안내 ${uniq()}`;
        const ghost = crypto.randomUUID();
        await sendFromScreen(page, { title, body: '오늘 밤 12시 점검이 있어요.', uuids: [player.account.uuid, ghost] });
        expect(await resultNumber(page, '받는 사람')).toBe(2);
        expect(await resultNumber(page, '새로 보냄')).toBe(1);
        expect(await resultNumber(page, '이미 받음')).toBe(0);
        expect(await resultNumber(page, '실패')).toBe(1);
        // 보낸 뒤 폼 비움
        await expect(page.getByLabel('제목')).toHaveValue('');

        // 플레이어: 로비에 있는 채로 배지 늘고 창에 제목·본문
        await expect(player.page.getByRole('button', { name: '알림 (읽지 않음 2개)' })).toBeVisible({ timeout: 15_000 });
        const dialog = await L.openNotifications(player.page);
        await expect(dialog.getByRole('listitem').filter({ hasText: title })).toContainText('오늘 밤 12시 점검이 있어요.');
    });

    test('AD-096: 접속자 전체 공지 → 접속 중 플레이어 둘 다 받음, 결과 수 2 이상 @serial', async ({ browser, players }) => {
        const one = await players.add({ mobile: false });
        const two = await players.add({ mobile: false });
        const adminContext = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 } });
        try {
            const page = await adminContext.newPage();
            await loginAsAdmin(page, await createAdmin());
            const title = `전체 공지 ${uniq()}`;
            await sendFromScreen(page, { title, body: '접속자 전체에게' });
            // serial이라 다른 시험 접속자는 거의 없음 → 둘은 꼭 들어 있음
            expect(await resultNumber(page, '받는 사람')).toBeGreaterThanOrEqual(2);
            expect(await resultNumber(page, '실패')).toBe(0);
            for (const player of [one, two]) {
                await expect(bell(player.page)).toHaveAccessibleName(/읽지 않음 2개/, { timeout: 15_000 });
                const dialog = await L.openNotifications(player.page);
                await expect(dialog.getByRole('listitem').filter({ hasText: title })).toBeVisible();
            }
        } finally {
            await adminContext.close();
        }
    });
});
