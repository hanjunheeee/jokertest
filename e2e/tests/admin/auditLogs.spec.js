// 관리자 처리 이력 브라우저 시험 (AD-106·107): 정지·해제·공지 뒤 두 칸에 그 줄 + 사유·결과 수 / 회원 닉네임으로 이력 찾기
// 프로젝트 admin (1280×800), 정지·해제는 1-2 경로(경계.md 약속)를 관리자 화면 안에서 직접 부름, 회원 찾기는 1-1 경로
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

const uniq = () => crypto.randomBytes(3).toString('hex');

// 관리자 화면 안에서 쓰기 경로 부르기 (쿠키·Origin은 브라우저가, 쓰기 확인 값은 /auth/me에서) → { status, body }
const adminWrite = (page, method, path, body) => page.evaluate(async ({ method: m, path: p, body: b }) => {
    const me = await (await fetch('/admin-api/auth/me', { credentials: 'same-origin', cache: 'no-store' })).json();
    const res = await fetch(`/admin-api${p}`, {
        method: m,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Csrf': me.csrfToken },
        body: JSON.stringify(b),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}, { method, path, body });

const historyTable = (page) => page.getByRole('table', { name: '처리 이력' });
const rowWith = (page, text) => historyTable(page).getByRole('row').filter({ hasText: text });
// 사유 칸이 딱 그 글인 줄 (해제 줄의 펼침 칸에도 정지 사유가 들어 있어 글 포함으로는 두 줄이 걸림)
const rowWithReason = (page, reason) => historyTable(page).getByRole('row')
    .filter({ has: page.getByRole('cell', { name: reason, exact: true }) });

async function openHistory(page, tab) {
    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: '처리 이력', level: 1 })).toBeVisible();
    if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByRole('button', { name: tab ?? '전체', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test.describe('관리자 처리 이력', () => {
    test('AD-106: 정지·해제·공지 뒤 "제재·해제 이력"·"공지 발송 이력"에 그 줄 + 사유·결과 수', async ({ page, accounts }) => {
        const member = await accounts.create();
        const admin = await createAdmin();
        await loginAsAdmin(page, admin);
        const banReason = `욕설 반복 ${uniq()}`;
        const liftReason = `오해 풀림 ${uniq()}`;

        const ban = await adminWrite(page, 'POST', `/members/${member.uuid}/bans`, { kind: 'PERIOD', days: 7, reason: banReason });
        expect(ban.status, JSON.stringify(ban.body)).toBe(201);
        const unban = await adminWrite(page, 'POST', `/members/${member.uuid}/unban`, { reason: liftReason });
        expect(unban.status, JSON.stringify(unban.body)).toBe(200);
        const title = `이력 공지 ${uniq()}`;
        const sent = await adminWrite(page, 'POST', '/announcements', {
            requestId: crypto.randomUUID(), title, body: '본문', target: 'users', userUuids: [member.uuid],
        });
        expect(sent.status).toBe(200);

        // 제재·해제 이력: 정지(종류)·해제 줄, 대상 닉네임·사유
        await openHistory(page, '제재·해제 이력');
        await page.getByLabel('누가').selectOption({ label: admin.loginId });
        const banRow = rowWithReason(page, banReason);
        await expect(banRow).toContainText('정지 (기간 정지 7일)');
        await expect(banRow).toContainText(member.nickname);
        const liftRow = rowWithReason(page, liftReason);
        await expect(liftRow).toContainText('정지 해제');
        await expect(liftRow).toContainText(member.nickname);
        await expect(rowWith(page, title)).toHaveCount(0);

        // 공지 발송 이력: 제목·대상·결과 수, 제재 줄은 없음
        await page.getByRole('button', { name: '공지 발송 이력', exact: true }).click();
        const announceRow = rowWith(page, title);
        await expect(announceRow).toContainText('고른 사람 1명');
        await expect(announceRow).toContainText('받는 사람 1 · 새로 보냄 1 · 중복 0 · 실패 0');
        await expect(rowWithReason(page, banReason)).toHaveCount(0);

        // 전후 값 펼쳐 보기
        await announceRow.getByText('전후 값 보기').click();
        await expect(announceRow.locator('pre').last()).toContainText(`"title": "${title}"`);
    });

    test('AD-107: 회원 닉네임으로 이력 찾기 → 그 회원 대상 줄만', async ({ page, accounts }) => {
        const member = await accounts.create();
        const other = await accounts.create();
        await loginAsAdmin(page, await createAdmin());
        const mine = `내 사유 ${uniq()}`;
        const theirs = `남 사유 ${uniq()}`;
        expect((await adminWrite(page, 'POST', `/members/${member.uuid}/force-disconnect`, { reason: mine })).status).toBe(200);
        expect((await adminWrite(page, 'POST', `/members/${other.uuid}/force-disconnect`, { reason: theirs })).status).toBe(200);

        await openHistory(page);
        await page.getByLabel('회원으로 찾기').fill(member.nickname);
        await page.getByRole('button', { name: '회원 찾기' }).click();
        await page.getByRole('list', { name: '찾은 회원' }).getByRole('listitem').filter({ hasText: member.uuid })
            .getByRole('button', { name: '이 회원 이력' }).click();
        await expect(page.getByText(`회원: ${member.nickname}`)).toBeVisible();
        await expect(rowWithReason(page, mine)).toContainText('강제 접속 종료');
        await expect(rowWithReason(page, theirs)).toHaveCount(0);
        await expect(historyTable(page).getByRole('row')).not.toHaveCount(1);
    });
});
