'use strict';

// 관리자 회원 상세 "탈주 기록" 브라우저 시험 (휴대폰 크기) — 폰에서는 표 대신 카드 목록으로 같은 줄(이유·상태)이 보임
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-094 — 탈주는 봇 판에서 진짜로 만듦 (산 채로 나가기)
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const { createAdmin, loginAsAdmin } = require('../../../helpers/adminAccounts');
const K = require('../../ingame/_a09-simple-kit');

test('A09-E-094 관리자 폰 화면 회원 상세, 산 채로 나간 계정 → 탈주 기록 카드에 "산 채로 나감"·"막힘 중" @game @smoke', async ({ page, table }) => {
    // 봇만 앉은 5명 판 (첫 봇 광대) → 시민 봇 하나가 산 채로 나감
    const t = await table.setup({ humans: [], bots: 5, roles: ({ bots }) => ({ [K.U(bots[0])]: 'JOKER' }) });
    const citizen = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toDay(t);
    const reply = await citizen.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, '나가기를 서버가 받음').toBe(true);

    await loginAsAdmin(page, await createAdmin());
    // 폰 크기에서는 "탈주 기록"이 카드 목록 (탈주 저장이 조금 늦을 수 있어 다시 읽으며)
    const card = page.getByRole('list', { name: '탈주 기록' }).getByRole('listitem').filter({ hasText: '산 채로 나감' });
    await expect(async () => {
        await page.goto(`/members/${citizen.account.uuid}`);
        await expect(page.getByRole('heading', { level: 1, name: citizen.account.nickname })).toBeVisible();
        await expect(card).toHaveCount(1, { timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await expectReadable(card.getByText('산 채로 나감', { exact: true }));
    await expectReadable(card.getByText('막힘 중', { exact: true }));
    await expect(card).toContainText(t.gameId);
    // 폰 크기엔 표가 없음
    await expect(page.getByRole('table', { name: '탈주 기록' })).toHaveCount(0);
});
