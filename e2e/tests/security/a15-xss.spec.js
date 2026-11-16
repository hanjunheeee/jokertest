'use strict';

// 입력 검사 브라우저 시험 (PC·모바일 창) — 문의·공지·친구 검색어·약관 링크에 넣은 스크립트가 글자로만 보이고 돌지 않음
// 목록 A15-보안.md 번호 A15-E-037~042 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-xss.spec.js)
const { test, expect, E2E, ui, internal } = require('../../helpers/fixtures');
const { trapXss, xssPayloads, assertNoXss } = require('../../helpers/security');
const { api, db } = require('./_sec');
const lobby = require('../lobby/lobbyHelpers');
const K = require('../auth/_a11a-kit');

// 시험만의 표식 넣은 글: 첫 줄(img onerror)은 제목, 여럿 이은 것은 본문
const payloadsFor = (id) => {
    const list = xssPayloads(`a15-${id}`);
    return { title: list[0], body: list.slice(0, 5).join(' ') };
};

// 그 사람 브라우저 쿠키로 API (화면이 보내는 것과 같은 Origin)
async function callAs(person, method, pathname, data) {
    const res = await person.context.request.fetch(`${E2E.apiUrl}${pathname}`, { method, data, headers: { origin: E2E.desktopUrl } });
    return { status: res.status(), body: await res.json().catch(() => null) };
}

// 덫 놓고 로비를 새로 엶 (덫은 다음 페이지 열기부터 먹음)
async function trappedLobby(page) {
    const trap = await trapXss(page);
    await ui.gotoLobby(page);
    return trap;
}

for (const [id, label, mobile] of [['A15-E-037', 'PC', false], ['A15-E-038', '모바일', true]]) {
    const smoke = id === 'A15-E-037' ? ' @smoke' : '';
    test(`${id} ${label} 문의 제목·본문에 <img onerror> → 내 문의 목록·자세히에 글자 그대로, 스크립트 안 돎${smoke}`, async ({ players }) => {
        const person = await players.add({ mobile });
        const { title, body } = payloadsFor(id);
        const made = await callAs(person, 'POST', '/inquiries', { category: 'BUG', title, body });
        expect(made.status, '문의 쓰기 (준비)').toBe(201);
        const inquiryId = made.body?.inquiry?.id;
        const page = person.page;
        const trap = await trappedLobby(page);
        await page.getByRole('button', { name: '고객센터' }).click();
        const win = page.getByTestId('inquiry-window');
        await expect(win).toBeVisible();
        // 목록 줄: 제목이 글자 그대로
        const row = win.getByTestId(`inquiry-row-${inquiryId}`);
        await expect(row).toContainText(title);
        await row.click();
        // 자세히: 제목·본문 글자 그대로, 넣은 img·svg 요소는 안 생김
        const detail = win.getByTestId('inquiry-detail');
        await expect(detail.getByRole('heading', { level: 3 })).toHaveText(title);
        await expect(detail).toContainText(body);
        await expect(win.locator('img[src="x"], svg[onload], details[ontoggle]')).toHaveCount(0);
        assertNoXss(trap);
    });
}

for (const [id, label, mobile] of [['A15-E-039', 'PC', false], ['A15-E-040', '모바일', true]]) {
    test(`${id} ${label} 안쪽 통로로 제목·본문에 스크립트 넣은 공지 → 알림 창에 글자 그대로, 스크립트 안 돎`, async ({ players }) => {
        const person = await players.add({ mobile });
        const { title, body } = payloadsFor(id);
        await internal.announceTo([person.account.uuid], { title, body });
        const page = person.page;
        const trap = await trappedLobby(page);
        const dialog = await lobby.openNotifications(page);
        await expect(dialog).toContainText(title);
        await expect(dialog).toContainText(body);
        await expect(dialog.locator('img[src="x"], svg[onload], details[ontoggle]')).toHaveCount(0);
        assertNoXss(trap);
    });
}

test('A15-E-041 PC 친구 검색 칸에 <script> → "검색 결과가 없습니다.", 스크립트 안 돎', async ({ user }) => {
    const page = user.page;
    const trap = await trappedLobby(page);
    const panel = await lobby.openFriendPanel(page);
    await lobby.openTab(page, '친구 추가');
    const box = panel.getByRole('textbox', { name: '친구 검색' });
    await box.fill(`<script>window.__xssHit&&window.__xssHit('XSS-a15-041')</script>`);
    await box.press('Enter');
    await expect(panel.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
    assertNoXss(trap);
});

test('A15-E-042 PC DB 약관 전문 링크를 javascript: 주소로 → 가입 화면 약관 보기에 그 링크 없음, 스크립트 안 돎 @serial', async ({ page }) => {
    // 약관 표는 모든 가입 화면이 같이 씀 → 서버 전체에 걸려 @serial, 끝에 꼭 원래대로
    const current = await api('GET', '/auth/terms');
    const ids = (current.json?.data?.terms ?? []).map((t) => t.id);
    expect(ids.length, '지금 약관이 있음 (준비)').toBeGreaterThan(0);
    const before = await db.query(`SELECT id, url FROM terms_versions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    const evil = "javascript:window.__xssHit&&window.__xssHit('XSS-a15-042')";
    try {
        for (const id of ids) await db.query('UPDATE terms_versions SET url = ? WHERE id = ?', [evil, id]);
        const trap = await trapXss(page);
        await K.openSignup(page);
        const views = K.termsGroup(page).getByRole('button', { name: '보기', exact: true });
        const count = await views.count();
        expect(count, '약관 보기 단추가 있음').toBeGreaterThan(0);
        for (let i = 0; i < count; i += 1) {
            await views.nth(i).click();
            const dialog = page.getByRole('dialog').last();
            await expect(dialog.getByRole('button', { name: '닫기' })).toBeVisible();
            await expect(dialog.getByRole('link', { name: '전문 새 창으로 보기' })).toHaveCount(0);
            await dialog.getByRole('button', { name: '닫기' }).click();
        }
        await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0);
        assertNoXss(trap);
    } finally {
        for (const row of before) await db.query('UPDATE terms_versions SET url = ? WHERE id = ?', [row.url, row.id]);
    }
});
