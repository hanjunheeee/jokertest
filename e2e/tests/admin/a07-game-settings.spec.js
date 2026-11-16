'use strict';

// 관리자 판 설정 브라우저 시험 (PC 크기) — 메뉴 "판 설정"에서 지금 판 골드 값 보기·바꾸기(확인 창)·범위 밖 오류 글·취소, 처리 이력의 "판 골드 바꿈", 회원 지갑의 "판 보상"
// 목록 시험목록/A07-승패-결과-골드.md A07-E-055~062·120, 모이는지만 봄: npx playwright test --list tests/admin/a07-game-settings.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('../ingame/b-night/_night');
const k = require('../ingame/_a07-simple-kit');

const { settingsScreen: screen } = k;
const id = (no) => `A07-E-${String(no).padStart(3, '0')}`;
const RANGE_ERROR = '0부터 100까지 정수로 넣어 주세요.';
const menu = (page, label) => page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: label, exact: true });

/**
 * 관리자 창을 열어 로그인하고 메뉴 "판 설정"으로 들어가 시험 → 창 닫기
 * 값을 바꾸는 시험(restore)은 끝에 1로 되돌림 — 값은 서버 전체가 같이 써서 그런 시험은 @serial
 * (@serial은 기본 주소가 게임 화면인 프로젝트에서 돌아서 늘 관리자 주소로 새 창을 엶)
 */
async function withSettings(browser, run, { restore = false } = {}) {
    const admin = await k.openAdmin(browser);
    try {
        await menu(admin.page, '판 설정').click();
        await expect(admin.page).toHaveURL(/\/game-settings/);
        await expect(screen.now(admin.page)).toBeVisible();
        await run(admin);
    } finally {
        try { if (restore) await admin.setGold(1); } finally { await admin.close(); }
    }
}

test(`${id(55)} 관리자 메뉴 "판 설정" → 지금 값 "1골드"가 읽힘 @smoke`, async ({ browser }) => {
    await withSettings(browser, async ({ page }) => {
        await expect(page.getByRole('heading', { name: '판 설정', level: 1 })).toBeVisible();
        await expect(screen.now(page)).toHaveText('1골드');
        await expectReadable(screen.now(page));
    });
});

test(`${id(56)} 2 넣고 바꾸기 → 확인 창 "1골드 → 2골드" → 확인 → "2골드" @serial`, async ({ browser }) => {
    await withSettings(browser, async ({ page }) => {
        await expect(screen.now(page)).toHaveText('1골드');
        const box = await k.askGoldChange(page, 2);
        await expectReadable(box.getByText('1골드 → 2골드', { exact: true }));
        await box.getByRole('button', { name: '바꾸기' }).click();
        await expect(box).toBeHidden();
        await expect(screen.now(page)).toHaveText('2골드');
        expect(await k.goldSetting()).toBe(2);
    }, { restore: true });
});

// A07-E-057~060: 범위 밖 입력 → 오류 글이 읽히고 값 그대로
[['101', '101'], ['-1', '-1'], ['1.5', '1.5'], ['', '빈칸']].forEach(([value, label], i) => {
    test(`${id(57 + i)} 판 골드에 ${label} 넣고 바꾸기 → 오류 글이 읽힘, 값 그대로`, async ({ browser }) => {
        await withSettings(browser, async ({ page }) => {
            const shown = await screen.now(page).innerText();
            const saved = await k.goldSetting();
            await screen.input(page).fill(value);
            await screen.submit(page).click();
            await expectReadable(screen.form(page).getByText(RANGE_ERROR, { exact: true }));
            // 확인 창도 안 뜨고 화면 값·표 값 그대로
            await expect(screen.confirm(page)).toHaveCount(0);
            await expect(screen.now(page)).toHaveText(shown);
            expect(await k.goldSetting()).toBe(saved);
        });
    });
});

test(`${id(61)} 2 넣고 바꾸기 → 확인 창에서 취소 → 값 그대로`, async ({ browser }) => {
    await withSettings(browser, async ({ page }) => {
        const shown = await screen.now(page).innerText();
        const saved = await k.goldSetting();
        const box = await k.askGoldChange(page, 2);
        await box.getByRole('button', { name: '취소' }).click();
        await expect(box).toBeHidden();
        await expect(screen.now(page)).toHaveText(shown);
        expect(await k.goldSetting()).toBe(saved);
    });
});

test(`${id(62)} 값을 바꾼 뒤 처리 이력 화면에 "판 골드 바꿈" 줄 @serial`, async ({ browser }) => {
    await withSettings(browser, async ({ page, admin }) => {
        const box = await k.askGoldChange(page, 2);
        await box.getByRole('button', { name: '바꾸기' }).click();
        await expect(screen.now(page)).toHaveText('2골드');
        await menu(page, '처리 이력').click();
        await expect(page).toHaveURL(/\/audit-logs/);
        // 이 시험이 만든 관리자가 한 일만 골라 봄 (새 계정이라 바꾼 것은 이 한 줄)
        const line = page.getByRole('row').filter({ hasText: admin.loginId }).filter({ hasText: '판 골드 바꿈' });
        await expect(line).toHaveCount(1);
        await expectReadable(line.getByText('판 골드 바꿈', { exact: true }));
    }, { restore: true });
});

test(`${id(120)} 판을 끝낸 회원의 관리자 지갑 화면에 "판 보상" 줄 @game`, async ({ browser, table }) => {
    // 봇 5명 판 (광대 1): 봇 표로 광대 처형 → 시민 승 → 판 골드 지급까지
    const botRoles = ['JOKER', ...k.C(4)];
    const t = await n.setup(table, { humans: [], bots: 5, settings: { ...k.LONG_TIMES, ...k.settingsOf(botRoles) }, botRoles });
    const [joker, member] = t.bots;
    await t.advanceUntil('DAY');
    const end = await k.execute(t, k.uid(joker));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.settled(t, member);
    const admin = await k.openAdmin(browser);
    try {
        await admin.page.goto(`/members/${k.uid(member)}`);
        const wallet = admin.page.getByRole('region', { name: '골드·다이아' });
        const line = wallet.getByRole('row').filter({ hasText: '판 보상' });
        await expect(line).toHaveCount(1);
        await expect(line).toContainText('골드 +1');
        await expectReadable(line.getByText('판 보상', { exact: true }));
        await expect(wallet.getByTestId('wallet-gold')).toHaveText(String(await k.gold(k.uid(member))));
    } finally {
        await admin.close();
    }
});
