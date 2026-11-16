'use strict';

// 이메일 가입 브라우저 시험 (PC) — 처음부터 끝까지·막힘 알림·경계 값·약관 칸·이메일 중복 확인 글이 보이는지
// 목록 A11a-가입-로그인-세션.md 번호 A11-E-001~021·033~037
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { addBannedWords, removeBannedWords } = require('../../helpers/bannedWords');
const K = require('./_a11a-kit');

const DONE = '회원가입이 완료되었습니다! 로그인해주세요.';
const LOGIN_FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';

test('A11-E-001 이메일 가입 처음부터 끝까지 (PC): 인증번호 → 약관 전체 동의 → 가입 완료 알림 → 로그인 → 로비 @smoke', async ({ page }) => {
    const v = await K.prepareSignup(page);
    // 단추로 보냄 (사람이 하는 그대로)
    expect(await K.submitSignupByButton(page)).toBe(DONE);
    // 가입 끝나면 로그인 칸으로 돌아옴
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    await K.loginToLobby(page, { email: v.email, password: v.password });
    await expect(page).toHaveURL(/\/lobby$/);
});

// 화면 검사에서 막히는 값 — 알림 글 = 그 칸 문구, 가입 요청 0번, 가입 칸 그대로 (값 하나 = 시험 하나)
const BLOCKED = [
    ['A11-E-002', '비번 7자', { password: K.testPw(7) }, '비밀번호는 8~64자여야 합니다.'],
    ['A11-E-003', '비번 65자', { password: K.testPw(65) }, '비밀번호는 8~64자여야 합니다.'],
    ['A11-E-004', '한글 비번 25자(75바이트)', { password: K.koreanPw(25) }, '비밀번호는 72바이트를 넘을 수 없습니다.'],
    ['A11-E-005', '비번 확인 다름', { password: 'testpass1234', passwordConfirm: 'testpass1235' }, '비밀번호 확인이 일치하지 않습니다.'],
    ['A11-E-006', '닉네임 1자', { nickname: '가' }, '닉네임은 2~8자여야 합니다.'],
    ['A11-E-007', '닉네임 9자', { nickname: '가나다라마바사아자' }, '닉네임은 2~8자여야 합니다.'],
    ['A11-E-008', '닉네임 "가_나"', { nickname: '가_나' }, '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.'],
    ['A11-E-009', '생일 내일', { birthDate: K.birthDateYearsAgo(0, -1) }, '생년월일은 미래일 수 없습니다.'],
];
for (const [id, name, override, message] of BLOCKED) {
    test(`${id} 가입 막힘 알림 (PC): ${name} → "${message}", 요청 0번, 가입 칸 그대로`, async ({ page }) => {
        const signupCalls = K.trackRequests(page, '/auth/signup');
        const v = await K.prepareSignup(page, override);
        expect(await K.submitSignupByEnter(page)).toBe(message);
        expect(signupCalls).toHaveLength(0);
        // 가입 칸이 그대로 남아 있고 친 값도 그대로
        await expect(K.signupArea(page)).toBeVisible();
        await expect(K.nicknameBox(K.signupArea(page))).toHaveValue(v.nickname);
    });
}

// 경계 값이라 통과 — 가입 완료 알림 → 그 비번으로 로그인 (값 하나 = 시험 하나)
const PASS_EDGE = [
    ['A11-E-010', '비번 8자', K.testPw(8)],
    ['A11-E-011', '비번 64자', K.testPw(64)],
    ['A11-E-012', '한글 비번 24자(72바이트)', K.koreanPw(24)],
];
for (const [id, name, password] of PASS_EDGE) {
    test(`${id} 경계 값으로 가입 됨 (PC): ${name} → 가입 완료 → 그 비번으로 로그인 → 로비`, async ({ page }) => {
        const v = await K.prepareSignup(page, { password });
        expect(await K.submitSignupByEnter(page)).toBe(DONE);
        await K.loginToLobby(page, { email: v.email, password });
        await expect(page).toHaveURL(/\/lobby$/);
    });
}

test('A11-E-013 비번 앞뒤 빈칸 그대로 (PC): " pass1234"로 가입 → "pass1234"는 실패 → " pass1234"는 로비', async ({ page }) => {
    const v = await K.prepareSignup(page, { password: ' pass1234' });
    expect(await K.submitSignupByEnter(page)).toBe(DONE);
    // 앞 빈칸을 자르지 않아서 빈칸 뺀 비번은 다른 비번
    expect(await K.loginAlert(page, v.email, 'pass1234')).toBe(LOGIN_FAIL);
    await expect(page).toHaveURL(/\/login$/);
    await K.loginToLobby(page, { email: v.email, password: ' pass1234' });
});

test('A11-E-014 가입 서버 거절 알림 (PC): 만 14세 미만 생일(약관 다 고름) → "만 14세 미만은 가입할 수 없습니다."', async ({ page }) => {
    // 만 14세 되기 하루 전 생일
    await K.prepareSignup(page, { birthDate: K.birthDateYearsAgo(14, -1) });
    expect(await K.submitSignupByEnter(page)).toBe('만 14세 미만은 가입할 수 없습니다.');
});

test('A11-E-015 가입 서버 거절 알림 (PC): 있는 닉네임 → "이미 사용 중인 닉네임입니다."', async ({ page, accounts }) => {
    const taken = await accounts.create();
    await K.prepareSignup(page, { nickname: taken.nickname });
    expect(await K.submitSignupByEnter(page)).toBe('이미 사용 중인 닉네임입니다.');
});

test('A11-E-016 가입 서버 거절 알림 (PC): 금지어 닉네임 → "사용할 수 없는 단어가 들어간 닉네임입니다."', async ({ page }) => {
    // 낱말은 시험마다 무작위 (다른 시험 닉네임·채팅에 안 걸리게)
    const word = `zq${Math.random().toString(36).slice(2, 6)}`;
    await addBannedWords([word]);
    try {
        await K.prepareSignup(page, { nickname: `a${word}` });
        expect(await K.submitSignupByEnter(page)).toBe('사용할 수 없는 단어가 들어간 닉네임입니다.');
    } finally {
        await removeBannedWords([word]);
    }
});

test('A11-E-017 약관 안 고름 (PC): 약관 안 고르고 가입 → "필수 약관에 동의해주세요."', async ({ page }) => {
    await K.prepareSignup(page, { agree: false });
    expect(await K.submitSignupByEnter(page)).toBe('필수 약관에 동의해주세요.');
});

test('A11-E-018 약관 안 고름 (PC): 약관만 고르고 만 14세 안 고름 → "만 14세 이상인지 확인해주세요."', async ({ page }) => {
    await K.prepareSignup(page, { agree: false });
    // 전체 동의·만 14세 줄 빼고 약관 줄만 하나씩 켬
    const rows = K.termsGroup(page).getByRole('checkbox').filter({ hasNotText: '전체 동의' }).filter({ hasNotText: '만 14세' });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) await rows.nth(i).click();
    for (let i = 0; i < count; i += 1) await expect(rows.nth(i)).toHaveAttribute('aria-checked', 'true');
    expect(await K.submitSignupByEnter(page)).toBe('만 14세 이상인지 확인해주세요.');
});

test('A11-E-019 약관 칸 (PC): "전체 동의" → 약관 전부·만 14세 켜짐', async ({ page }) => {
    await K.openSignup(page);
    await K.agreeAll(page);
    const boxes = K.termsGroup(page).getByRole('checkbox');
    // 전체 동의 + 약관 1개 이상 + 만 14세
    expect(await boxes.count()).toBeGreaterThanOrEqual(3);
    for (const box of await boxes.all()) await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(K.termsGroup(page).getByRole('checkbox', { name: /만 14세 이상입니다/ })).toHaveAttribute('aria-checked', 'true');
});

test('A11-E-020 약관 칸 (PC): 약관 "보기" → 전체 보기 창 글 보임 → 닫기', async ({ page }) => {
    await K.openSignup(page);
    await K.termsGroup(page).getByRole('button', { name: '보기' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 창 제목·버전 줄이 사람 눈에 읽힘
    await expectReadable(dialog.getByRole('heading'));
    await expectReadable(dialog.getByText(/^버전 /));
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toHaveCount(0);
});

test('A11-E-021 인증 안 하고 가입 (PC): 인증번호 안 받고 가입 → "이메일 인증을 완료해주세요."', async ({ page }) => {
    const signupCalls = K.trackRequests(page, '/auth/signup');
    await K.prepareSignup(page, { verify: false });
    // 출처(F-31 2-3a): 인증 전엔 가입 단추 꺼짐 + 안내 줄, 서버 호출 없음
    await expect(K.signupSubmit(page)).toBeDisabled();
    await expect(K.signupHint(page)).toBeVisible();
    // 목록 기대: 가입을 누르면 알림 (단추가 꺼져 있어 Enter로 보냄)
    expect(await K.submitSignupByEnter(page)).toBe('이메일 인증을 완료해주세요.');
    expect(signupCalls).toHaveLength(0);
});

// 이메일 중복 확인 단추 누르고 결과 글
const emailCheckButton = (page) => page.getByRole('button', { name: '이메일 중복확인' });
async function checkEmail(page, email) {
    await K.openSignup(page);
    await K.fillSignup(page, { email });
    await emailCheckButton(page).click();
}

test('A11-E-033 이메일 중복 확인 (PC): 새 주소 → "사용할 수 있는 이메일입니다."', async ({ page }) => {
    await checkEmail(page, K.newEmail('ck'));
    await expect(page.getByText('사용할 수 있는 이메일입니다.')).toBeVisible();
});

test('A11-E-034 이메일 중복 확인 (PC): 있는 주소 → "이미 사용 중인 이메일입니다."', async ({ page, accounts }) => {
    const taken = await accounts.create();
    await checkEmail(page, taken.email);
    await expect(page.getByText('이미 사용 중인 이메일입니다.')).toBeVisible();
});

test('A11-E-035 이메일 중복 확인 (PC): 결과 뒤 이메일 고침 → 글 사라짐', async ({ page }) => {
    const email = K.newEmail('ck');
    await checkEmail(page, email);
    await expect(page.getByText('사용할 수 있는 이메일입니다.')).toBeVisible();
    await K.fillSignup(page, { email: `x${email}` });
    await expect(page.getByText('사용할 수 있는 이메일입니다.')).toHaveCount(0);
});

test('A11-E-036 중복 확인 글이 보임 (PC): "사용할 수 있는 이메일입니다." → 읽힘', async ({ page }) => {
    await checkEmail(page, K.newEmail('ck'));
    await expectReadable(page.getByText('사용할 수 있는 이메일입니다.'));
});

test('A11-E-037 중복 확인 글이 보임 (PC): "이미 사용 중인 이메일입니다." → 읽힘', async ({ page, accounts }) => {
    const taken = await accounts.create();
    await checkEmail(page, taken.email);
    await expectReadable(page.getByText('이미 사용 중인 이메일입니다.'));
});
