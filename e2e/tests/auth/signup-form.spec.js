// 가입 칸 시험: 인증 끝낸 뒤 닉네임·비번·생일·14세·금지어·약관 규칙, 가입 완료 안내와 그 뒤 로그인
// 칸 검사는 화면이 알림으로 막고, 중복·14세·금지어는 서버가 막음 (문구는 둘 다 같은 알림)
const crypto = require('node:crypto');
const { test, expect, internal } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const h = require('./authHelpers');

test.describe('가입 완료', () => {
    // 앱 문제 (문제목록/auth.md 1번): 버튼 칸 높이 0 → 안 보이고 다른 글자가 누름을 가로챔, 고칠 때까지 실패로 남김
    test('인증·약관까지 끝내면 → 회원가입 버튼이 눈에 보이고 눌러서 가입됨', async ({ page }) => {
        await h.prepareValidSignup(page);
        const button = h.signupButton(page);
        await button.scrollIntoViewIfNeeded();
        const wrapHeight = await button.evaluate((el) => el.parentElement.getBoundingClientRect().height);
        expect(wrapHeight, '버튼 칸 높이').toBeGreaterThan(20);
        expect(await h.quickAlert(page, () => button.click({ timeout: 5000 }))).toBe('회원가입이 완료되었습니다! 로그인해주세요.');
    });

    test('맞게 다 넣고 회원가입을 누르면 → 완료 알림이 뜨고 로그인 칸으로 돌아감', async ({ page }) => {
        await h.prepareValidSignup(page);
        expect(await h.submitSignup(page)).toBe('회원가입이 완료되었습니다! 로그인해주세요.');
        await expect(h.loginButton(page)).toBeVisible();
        await expect(page.getByText('계정을 로그인 하여 무도회에 입장하세요.')).toBeVisible();
    });

    test('가입한 이메일·비번으로 로그인하면 → 로비로 가고 닉네임이 보임', async ({ page }) => {
        const values = await h.prepareValidSignup(page);
        await h.submitSignup(page);
        await h.emailBox(page).fill(values.email);
        await h.passwordBox(page).fill(values.password);
        await h.loginButton(page).click();
        await expect(page).toHaveURL(/\/lobby$/);
        await page.getByRole('button', { name: '인트로 건너뛰기' }).click({ timeout: 5000 }).catch(() => {});
        await expect(page.getByRole('button', { name: '마이페이지' })).toContainText(values.nickname);
    });

    test('가입하면 → DB에 이메일 인증 끝·생일·지금 약관 동의 두 줄이 남음', async ({ page }) => {
        const values = await h.prepareValidSignup(page, { birthDate: '1999-05-06' });
        await h.submitSignup(page);
        const [user] = await db.query('SELECT uuid, email_verified, DATE_FORMAT(birth_date, "%Y-%m-%d") AS bd FROM users WHERE email = ?', [values.email]);
        expect(Boolean(Number(user.email_verified))).toBe(true);
        expect(user.bd).toBe('1999-05-06');
        const agreed = await db.query('SELECT terms_version_id FROM user_terms_agreements WHERE user_id = ?', [user.uuid]);
        expect(agreed.length).toBe(2);
    });

    test('가입 완료 뒤 다시 회원가입을 열면 → 인증·약관이 처음 상태로 비어 있음', async ({ page }) => {
        await h.prepareValidSignup(page);
        await h.submitSignup(page);
        await page.getByRole('button', { name: '회원가입' }).click();
        await expect(h.sendCodeButton(page)).toHaveText('인증번호 받기');
        await expect(h.termsGroup(page).getByRole('checkbox', { name: '전체 동의' })).toHaveAttribute('aria-checked', 'false');
        await expect(h.signupButton(page)).toBeDisabled();
    });
});

test.describe('가입 닉네임', () => {
    for (const [name, nickname, message] of [
        ['닉네임을 비우면', '', '닉네임을 입력해주세요.'],
        ['닉네임이 1자면', '가', '닉네임은 2~8자여야 합니다.'],
        ['닉네임이 9자면', 'abcdefghi', '닉네임은 2~8자여야 합니다.'],
        ['닉네임에 특수문자가 있으면', 'ab_cd!', '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.'],
        ['닉네임 가운데 띄어쓰기가 있으면', 'ab cd', '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.'],
    ]) {
        test(`${name} → "${message}" 알림이 뜨고 가입 안 됨`, async ({ page }) => {
            const values = await h.prepareValidSignup(page, { nickname });
            expect(await h.submitSignup(page)).toBe(message);
            const rows = await db.query('SELECT 1 FROM users WHERE email = ?', [values.email]);
            expect(rows.length).toBe(0);
        });
    }

    test('한글 2자 닉네임은 → 가입 됨', async ({ page }) => {
        const nick = `가${String.fromCharCode(0xac00 + crypto.randomInt(0, 11172))}`;
        await h.prepareValidSignup(page, { nickname: nick });
        const message = await h.submitSignup(page);
        // 무작위 한글 2자가 드물게 남과 겹칠 수 있음
        expect(['회원가입이 완료되었습니다! 로그인해주세요.', '이미 사용 중인 닉네임입니다.']).toContain(message);
    });

    test('남이 쓰는 닉네임이면 → "이미 사용 중인 닉네임입니다" 알림', async ({ page, accounts }) => {
        const other = await accounts.create();
        await h.prepareValidSignup(page, { nickname: other.nickname });
        expect(await h.submitSignup(page)).toBe('이미 사용 중인 닉네임입니다.');
    });

    test('금지어가 든 닉네임이면 → "사용할 수 없는 단어가 들어간 닉네임입니다" 알림', async ({ page }) => {
        const word = `금${crypto.randomBytes(2).toString('hex')}`;
        await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
        try {
            await internal.reloadBannedWords();
            await h.prepareValidSignup(page, { nickname: `${word}a` });
            expect(await h.submitSignup(page)).toBe('사용할 수 없는 단어가 들어간 닉네임입니다.');
        } finally {
            await db.query('DELETE FROM banned_words WHERE word = ?', [word]);
            await internal.reloadBannedWords();
        }
    });
});

test.describe('가입 비번', () => {
    test('비번을 비우면 → "비밀번호를 입력해주세요" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { password: '', passwordConfirm: '' });
        expect(await h.submitSignup(page)).toBe('비밀번호를 입력해주세요.');
    });

    test('비번이 7자면 → 8~64자 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { password: 'Ab1!xyz' });
        expect(await h.submitSignup(page)).toBe('비밀번호는 8~64자여야 합니다.');
    });

    test('비번이 65자면 → 8~64자 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { password: 'a'.repeat(65) });
        expect(await h.submitSignup(page)).toBe('비밀번호는 8~64자여야 합니다.');
    });

    test('한글로 72바이트를 넘으면 (25자=75바이트) → 바이트 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { password: '가'.repeat(25) });
        expect(await h.submitSignup(page)).toBe('비밀번호는 72바이트를 넘을 수 없습니다.');
    });

    test('비번 확인이 다르면 → "비밀번호 확인이 일치하지 않습니다" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { password: 'Same!pass123', passwordConfirm: 'Same!pass124' });
        expect(await h.submitSignup(page)).toBe('비밀번호 확인이 일치하지 않습니다.');
    });
});

test.describe('가입 생일·14세', () => {
    test('생일을 비우면 → "생년월일을 입력해주세요" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { birthDate: '' });
        expect(await h.submitSignup(page)).toBe('생년월일을 입력해주세요.');
    });

    test('생일이 내일이면 → "생년월일은 미래일 수 없습니다" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { birthDate: h.birthDateYearsAgo(0, -2) });
        expect(await h.submitSignup(page)).toBe('생년월일은 미래일 수 없습니다.');
    });

    test('만 14세 생일이 내일인 사람이면 → "만 14세 미만은 가입할 수 없습니다" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { birthDate: h.birthDateYearsAgo(14, -1) });
        expect(await h.submitSignup(page)).toBe('만 14세 미만은 가입할 수 없습니다.');
    });

    test('10살이면 (14세 체크를 켜도) → 만 14세 미만 거절', async ({ page }) => {
        await h.prepareValidSignup(page, { birthDate: h.birthDateYearsAgo(10) });
        expect(await h.submitSignup(page)).toBe('만 14세 미만은 가입할 수 없습니다.');
    });

    test('오늘 딱 만 14세가 된 사람이면 → 가입 됨', async ({ page }) => {
        await h.prepareValidSignup(page, { birthDate: h.birthDateYearsAgo(14) });
        expect(await h.submitSignup(page)).toBe('회원가입이 완료되었습니다! 로그인해주세요.');
    });
});

test.describe('가입 약관', () => {
    const all = (page) => h.termsGroup(page).getByRole('checkbox', { name: '전체 동의' });
    const terms = (page) => h.termsGroup(page).getByRole('checkbox', { name: '(필수) 이용약관 동의' });
    const privacy = (page) => h.termsGroup(page).getByRole('checkbox', { name: '(필수) 개인정보 처리방침 동의' });
    const age = (page) => h.termsGroup(page).getByRole('checkbox', { name: '(필수) 만 14세 이상입니다' });

    test('시행일이 지난 약관만 → 동의 줄로 보임 (DB 시행일과 견줌)', async ({ page }) => {
        const rows = await db.query('SELECT kind, effective_at FROM terms_versions');
        const live = new Set(rows.filter((r) => new Date(r.effective_at).getTime() <= Date.now()).map((r) => r.kind));
        await h.openSignup(page);
        await expect(terms(page)).toHaveCount(live.has('TERMS') ? 1 : 0);
        await expect(privacy(page)).toHaveCount(live.has('PRIVACY') ? 1 : 0);
        // 지금 시험 DB 약관 시행일(2026-11-09 0시 UTC)은 지났음 → 둘 다 보여야 함
        expect(live.has('TERMS') && live.has('PRIVACY')).toBe(true);
    });

    test('약관 목록을 받지 못하면 → 줄 대신 "약관을 불러오지 못했습니다"와 다시 불러오기, 누르면 줄이 보임', async ({ page }) => {
        let fail = true;
        await page.route('**/auth/terms', (route) => (fail ? route.abort() : route.continue()));
        await page.goto('/login');
        await page.getByRole('button', { name: '회원가입' }).click();
        await expect(page.getByText('약관을 불러오지 못했습니다.')).toBeVisible();
        fail = false;
        await page.getByRole('button', { name: '다시 불러오기' }).click();
        await expect(terms(page)).toBeVisible();
    });

    test('전체 동의를 누르면 → 약관 둘과 14세가 다 켜지고 다시 누르면 다 꺼짐', async ({ page }) => {
        await h.openSignup(page);
        await all(page).click();
        for (const box of [terms(page), privacy(page), age(page)]) await expect(box).toHaveAttribute('aria-checked', 'true');
        await all(page).click();
        for (const box of [terms(page), privacy(page), age(page), all(page)]) await expect(box).toHaveAttribute('aria-checked', 'false');
    });

    test('하나씩 다 켜면 → 전체 동의도 켜지고 하나 끄면 전체 동의가 꺼짐', async ({ page }) => {
        await h.openSignup(page);
        await terms(page).click();
        await privacy(page).click();
        await expect(all(page)).toHaveAttribute('aria-checked', 'false');
        await age(page).click();
        await expect(all(page)).toHaveAttribute('aria-checked', 'true');
        await privacy(page).click();
        await expect(all(page)).toHaveAttribute('aria-checked', 'false');
    });

    test('약관을 하나도 안 켜면 → "필수 약관에 동의해주세요" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { agree: false });
        expect(await h.submitSignup(page)).toBe('필수 약관에 동의해주세요.');
    });

    test('이용약관만 켜면 → 필수 약관 알림 (개인정보 빠짐)', async ({ page }) => {
        await h.prepareValidSignup(page, { agree: false });
        await terms(page).click();
        await age(page).click();
        expect(await h.submitSignup(page)).toBe('필수 약관에 동의해주세요.');
    });

    test('약관 둘만 켜고 14세를 안 켜면 → "만 14세 이상인지 확인해주세요" 알림', async ({ page }) => {
        await h.prepareValidSignup(page, { agree: false });
        await terms(page).click();
        await privacy(page).click();
        expect(await h.submitSignup(page)).toBe('만 14세 이상인지 확인해주세요.');
    });

    test('이용약관 보기를 누르면 → 제목·버전·시행일·본문 창이 뜨고 닫기로 닫힘', async ({ page }) => {
        const [row] = await db.query("SELECT version, LEFT(body, 20) AS head FROM terms_versions WHERE kind = 'TERMS' ORDER BY effective_at DESC, id DESC LIMIT 1");
        await h.openSignup(page);
        const rowBox = h.termsGroup(page).locator('div').filter({ has: page.getByRole('checkbox', { name: '(필수) 이용약관 동의' }) }).last();
        await rowBox.getByRole('button', { name: '보기' }).click();
        const dialog = page.getByRole('dialog', { name: '이용약관' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(`버전 ${row.version}`);
        await expect(dialog).toContainText('시행일');
        await expect(dialog).toContainText(row.head);
        await dialog.getByRole('button', { name: '닫기' }).click();
        await expect(dialog).toHaveCount(0);
    });

    test('개인정보 처리방침 보기 창은 → Esc로도 닫히고 동의 상태는 그대로', async ({ page }) => {
        await h.openSignup(page);
        await privacy(page).click();
        const rowBox = h.termsGroup(page).locator('div').filter({ has: page.getByRole('checkbox', { name: '(필수) 개인정보 처리방침 동의' }) }).last();
        await rowBox.getByRole('button', { name: '보기' }).click();
        const dialog = page.getByRole('dialog', { name: '개인정보 처리방침' });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(privacy(page)).toHaveAttribute('aria-checked', 'true');
    });
});
