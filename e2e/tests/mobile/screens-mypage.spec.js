// 모바일 마이페이지·계정 관리·이모티콘·설정·서고 (375×812 세로): 칸·이동·닉네임 변경·비번 확인·탈퇴, 가로 넘침 없음
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { overflowX } = require('./_talk');

const section = (page, heading) => page.locator('section, div').filter({ has: page.getByRole('heading', { name: heading, level: 3 }) }).last();

test.describe('마이페이지', () => {
    test('마이페이지는 → 내 닉네임·전체 판수 0·승률 0.0%와 버튼 넷이 보이고 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/mypage');
        await expect(user.page.getByRole('heading', { name: '마이페이지' })).toBeVisible();
        await expect(user.page.getByText(user.account.nickname, { exact: true })).toBeVisible();
        await expect(user.page.getByText(/전체 판수\s*0/)).toBeVisible();
        await expect(user.page.getByText(/승률\s*0\.0%/)).toBeVisible();
        for (const name of ['계정 관리', '프로필 수정', '스킨&카드 착용', '이모티콘']) await expect(user.page.getByRole('button', { name })).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('마이페이지에서 "계정 관리"를 누르면 → 계정 관리 화면으로 감', async ({ user }) => {
        await user.page.goto('/mypage');
        await user.page.getByRole('button', { name: '계정 관리' }).click();
        await expect(user.page).toHaveURL(/\/account$/);
        await expect(user.page.getByRole('heading', { name: '계정 관리' })).toBeVisible();
    });

    test('마이페이지에서 "프로필 수정"을 누르면 → 프로필 수정 시트가 375 폭 안에 열림', async ({ user }) => {
        await user.page.goto('/mypage');
        await user.page.getByRole('button', { name: '프로필 수정' }).click();
        const sheet = user.page.getByRole('dialog').last();
        await expect(sheet).toBeVisible();
        const box = await sheet.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(376);
    });

    test('마이페이지에서 "스킨&카드 착용"을 누르면 → 착용 시트가 열림', async ({ user }) => {
        await user.page.goto('/mypage');
        await user.page.getByRole('button', { name: '스킨&카드 착용' }).click();
        await expect(user.page.getByRole('dialog').last()).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('마이페이지에서 "이모티콘"을 누르면 → 팔레트 8칸에 기본 이모티콘이 채워진 화면이 열림', async ({ user }) => {
        await user.page.goto('/mypage');
        await user.page.getByRole('button', { name: '이모티콘' }).click();
        await expect(user.page).toHaveURL(/\/mypage\/emoticons$/);
        const slots = user.page.getByRole('group', { name: '팔레트 슬롯' });
        await expect(slots.getByRole('button', { name: /번 슬롯$/ })).toHaveCount(8);
        await expect(slots.getByRole('img', { name: '안녕' })).toBeVisible();
        await expect(user.page.getByRole('list', { name: '이모티콘 목록' }).getByRole('button', { name: '가시박힌 심장 (미보유)' })).toBeDisabled();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });
});

test.describe('계정 관리', () => {
    test('계정 관리 화면은 → 닉네임·이메일·비밀번호 변경·회원 탈퇴·Discord 연결 칸이 있고 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/account');
        for (const name of ['닉네임 변경', '이메일 변경', '비밀번호 변경', '회원 탈퇴', 'Discord 계정 연결']) {
            await expect(user.page.getByRole('heading', { name, level: 3 })).toBeVisible();
        }
        await expect(user.page.getByText(`지금 이메일: ${user.account.email}`)).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('새 닉네임을 넣고 변경하면 → 성공 안내가 뜨고 로비 위 이름이 바뀜', async ({ user }) => {
        await user.page.goto('/account');
        const next = `n${crypto.randomBytes(3).toString('hex')}`;
        await user.page.getByRole('textbox', { name: '새 닉네임' }).fill(next);
        await section(user.page, '닉네임 변경').getByRole('button', { name: '변경' }).click();
        await expect(user.page.getByRole('status').filter({ hasText: /변경|완료/ })).toBeVisible({ timeout: 10000 });
        await ui.gotoLobby(user.page);
        await expect(user.page.getByRole('button', { name: '마이페이지' })).toContainText(next);
    });

    test('비밀번호 변경에서 현재 비번을 틀리면 → 오류 안내가 뜨고 원래 비번으로 계속 로그인됨', async ({ user, players }) => {
        await user.page.goto('/account');
        const box = section(user.page, '비밀번호 변경');
        await box.getByRole('textbox', { name: '현재 비밀번호' }).fill(`${user.account.password}x`);
        await box.getByRole('textbox', { name: '새 비밀번호' }).fill('NewPass!2345');
        await box.getByRole('button', { name: '변경' }).click();
        await expect(box.getByRole('alert')).toBeVisible({ timeout: 10000 });
        const p2 = await players.add({ login: false });
        await ui.loginViaUi(p2.page, user.account);
    });

    test('회원 탈퇴에서 비번을 틀리면 → 확인 창이 안 뜨거나 오류 안내가 뜨고 계정은 그대로', async ({ user, players }) => {
        await user.page.goto('/account');
        const box = section(user.page, '회원 탈퇴');
        await box.getByRole('textbox', { name: '비밀번호' }).fill('틀린비번123!');
        await box.getByRole('button', { name: '탈퇴' }).click();
        const confirm = user.page.getByRole('dialog', { name: '정말 탈퇴할까요?' });
        if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.getByRole('button', { name: '탈퇴하기' }).click();
        await expect(user.page.getByRole('alert').first()).toBeVisible({ timeout: 10000 });
        const p2 = await players.add({ login: false });
        await ui.loginViaUi(p2.page, user.account);
    });

    test('회원 탈퇴에서 맞는 비번 → "정말 탈퇴할까요?" 확인에서 탈퇴하기를 누르면 → 로그인 화면으로 가고 다시 로그인 안 됨', async ({ user, players }) => {
        await user.page.goto('/account');
        const box = section(user.page, '회원 탈퇴');
        await box.getByRole('textbox', { name: '비밀번호' }).fill(user.account.password);
        await box.getByRole('button', { name: '탈퇴' }).click();
        const confirm = user.page.getByRole('dialog', { name: '정말 탈퇴할까요?' });
        await expect(confirm).toBeVisible();
        user.page.on('dialog', (d) => d.accept().catch(() => {}));
        await confirm.getByRole('button', { name: '탈퇴하기' }).click();
        await expect(user.page).toHaveURL(/\/login$|\/$/, { timeout: 15000 });
        const p2 = await players.add({ login: false });
        await p2.page.goto('/login');
        await p2.page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(user.account.email);
        await p2.page.getByRole('textbox', { name: '비밀번호를 입력하세요' }).fill(user.account.password);
        const message = await ui.captureAlert(p2.page, () => p2.page.getByRole('button', { name: '로그인', exact: true }).click());
        expect(message.length).toBeGreaterThan(0);
        await expect(p2.page).toHaveURL(/\/login$/);
    });

    test('Discord "연결하기"를 누르면 → "Discord 연결 확인" 창이 뜨고 취소로 닫힘', async ({ user }) => {
        await user.page.goto('/account');
        await user.page.getByRole('button', { name: '연결하기' }).click();
        const dialog = user.page.getByRole('dialog', { name: 'Discord 연결 확인' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Discord 계정을 이 계정에 연결하시겠습니까?');
        await dialog.getByRole('button', { name: '취소' }).click();
        await expect(dialog).toHaveCount(0);
    });
});

test.describe('설정·서고', () => {
    test('설정 화면에서 "사운드" 탭을 누르면 → 사운드 항목으로 바뀌고 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/setting');
        const tabs = user.page.getByRole('navigation', { name: '설정 탭' });
        await tabs.getByRole('button', { name: '사운드' }).click();
        await expect(tabs.getByRole('button', { name: '사운드' })).toHaveAttribute('aria-pressed', 'true');
        await expect(user.page.getByRole('slider').first()).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('설정 화면에서 "게임 초대" 알림을 끄면 → 체크가 풀리고 새로 들어와도 꺼진 그대로', async ({ user }) => {
        await user.page.goto('/setting');
        const box = user.page.getByRole('checkbox', { name: '게임 초대' });
        await expect(box).toBeChecked();
        await box.click();
        await expect(box).not.toBeChecked();
        await user.page.reload();
        await expect(user.page.getByRole('checkbox', { name: '게임 초대' })).not.toBeChecked();
    });

    test('기억의 서고에서 "초대받은 자들"을 누르면 → 그 책으로 바뀌고 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/library');
        await expect(user.page.getByRole('heading', { name: '금지된 기록', level: 1 })).toBeVisible();
        await user.page.getByRole('button', { name: '초대받은 자들' }).click();
        await expect(user.page.getByRole('heading', { name: '초대받은 자들', level: 1 })).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('기억의 서고 "다음 페이지"를 누르면 → 다음 쪽으로 넘어가고 "이전 페이지"가 켜짐', async ({ user }) => {
        await user.page.goto('/library');
        await expect(user.page.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
        await user.page.getByRole('button', { name: '다음 페이지' }).click();
        await expect(user.page.getByRole('button', { name: '이전 페이지' })).toBeEnabled();
    });
});
