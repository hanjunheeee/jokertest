// 소셜 버튼 시험 (시험 서버엔 소셜 키가 없음 → 누르면 서버로 이동했다가 오류 안내까지) + 약관 재동의 창
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');

test.describe('소셜 로그인 버튼', () => {
    test('Google 로그인을 누르면 → 서버로 갔다가 로그인 화면에 "Google 로그인을 사용할 수 없습니다" 안내', async ({ page }) => {
        await page.goto('/login');
        const started = page.waitForRequest((r) => r.url().startsWith(`${E2E.apiUrl}/auth/google`));
        await page.getByRole('button', { name: 'Google 로그인' }).click();
        expect((await started).url()).toContain('rememberMe=false');
        await expect(page).toHaveURL(/\/login\?socialError=/);
        await expect(page.getByRole('alert')).toHaveText('지금은 Google 로그인을 사용할 수 없습니다.');
    });

    test('Discord 로그인을 누르면 → 서버로 갔다가 "Discord 로그인을 사용할 수 없습니다" 안내', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('button', { name: 'Discord 로그인' }).click();
        await expect(page).toHaveURL(/\/login\?socialError=/);
        await expect(page.getByRole('alert')).toHaveText('지금은 Discord 로그인을 사용할 수 없습니다.');
    });

    test('로그인 상태 유지를 켜고 소셜 버튼을 누르면 → 서버 주소에 rememberMe=true가 실림', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('checkbox', { name: '로그인 상태 유지' }).click();
        const started = page.waitForRequest((r) => r.url().startsWith(`${E2E.apiUrl}/auth/discord`));
        await page.getByRole('button', { name: 'Discord 로그인' }).click();
        expect((await started).url()).toContain('rememberMe=true');
    });

    test('모르는 소셜 오류 코드로 돌아오면 → 기본 실패 문구', async ({ page }) => {
        await page.goto('/login?socialError=SOMETHING_ODD');
        await expect(page.getByRole('alert')).toHaveText('소셜 로그인에 실패했습니다. 다시 시도해주세요.');
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    });
});

test.describe('약관 재동의 창', () => {
    const gate = (page) => page.getByRole('dialog', { name: '약관이 바뀌었습니다' });

    test('지금 약관에 동의 안 한 계정이 들어오면 → 재동의 창에 두 약관이 보이고 Esc로 안 닫힘', async ({ page, context, accounts }) => {
        const account = await accounts.create({ agreeTerms: false });
        await ui.loginViaApi(context, account);
        await page.goto('/lobby');
        await expect(gate(page)).toBeVisible();
        await expect(gate(page)).toContainText('이용약관');
        await expect(gate(page)).toContainText('개인정보 처리방침');
        await page.keyboard.press('Escape');
        await expect(gate(page)).toBeVisible();
    });

    test('재동의 창에서 보기를 누르면 → 그 약관 전문 창이 뜨고 닫으면 재동의 창으로 돌아옴', async ({ page, context, accounts }) => {
        const account = await accounts.create({ agreeTerms: false });
        await ui.loginViaApi(context, account);
        await page.goto('/lobby');
        await gate(page).getByRole('listitem').filter({ hasText: '이용약관' }).getByRole('button', { name: '보기' }).click();
        const view = page.getByRole('dialog', { name: '이용약관' });
        await expect(view).toBeVisible();
        await view.getByRole('button', { name: '닫기' }).click();
        await expect(gate(page)).toBeVisible();
    });

    test('모두 동의하고 계속을 누르면 → 창이 닫히고 DB에 동의가 남으며 새로 읽어도 안 뜸', async ({ page, context, accounts }) => {
        const account = await accounts.create({ agreeTerms: false });
        await ui.loginViaApi(context, account);
        await page.goto('/lobby');
        await gate(page).getByRole('button', { name: '모두 동의하고 계속' }).click();
        await expect(gate(page)).toHaveCount(0);
        const rows = await db.query('SELECT 1 FROM user_terms_agreements WHERE user_id = ?', [account.uuid]);
        expect(rows.length).toBe(2);
        await page.reload();
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        await expect(gate(page)).toHaveCount(0);
    });

    test('한 약관만 동의해 둔 계정이면 → 재동의 창에 빠진 약관 하나만 보임', async ({ page, context, accounts }) => {
        const account = await accounts.create({ agreeTerms: false });
        const [termsRow] = await db.query("SELECT id FROM terms_versions WHERE kind = 'TERMS' AND effective_at <= NOW() ORDER BY effective_at DESC, id DESC LIMIT 1");
        await db.query('INSERT INTO user_terms_agreements (user_id, terms_version_id, agreed_at) VALUES (?, ?, NOW())', [account.uuid, termsRow.id]);
        await ui.loginViaApi(context, account);
        await page.goto('/lobby');
        await expect(gate(page)).toBeVisible();
        await expect(gate(page).getByRole('listitem')).toHaveCount(1);
        await expect(gate(page)).toContainText('개인정보 처리방침');
    });

    test('지금 약관에 동의한 계정은 → 재동의 창이 안 뜸', async ({ user }) => {
        await expect(user.page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        await expect(gate(user.page)).toHaveCount(0);
    });
});
