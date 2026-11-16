'use strict';

// 관리자 회원 상세 "탈주 기록" 브라우저 시험 (PC 크기) — 산 채로 나간 계정·60초 못 돌아온 계정의 이유 글과 "막힘 중", 탈주 없는 계정의 빈 글
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-091~093 — 탈주는 봇 판에서 진짜로 만듦 (나가기 / 끊김 + 60초 손잡이)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const K = require('../ingame/_a09-simple-kit');

// 봇만 앉은 판 (첫 봇 광대, 나머지 시민) → 판과 시민 봇 하나
async function botTable(table, n) {
    const t = await table.setup({ humans: [], bots: n, roles: ({ bots }) => ({ [K.U(bots[0])]: 'JOKER' }) });
    const s = await t.state();
    expect(s.players).toHaveLength(n);
    return { t, citizen: K.botOf(t, s, 'CITIZEN') };
}

// 관리자로 로그인해 그 회원 상세를 엶
async function openMember(page, account) {
    await page.goto(`/members/${account.uuid}`);
    await expect(page.getByRole('heading', { level: 1, name: account.nickname })).toBeVisible();
}

// "탈주 기록" 표에 그 이유 줄이 한 줄 생길 때까지 (탈주 저장이 조금 늦을 수 있어 다시 읽으며) → 줄
async function desertionRow(page, account, reason) {
    const row = page.getByRole('table', { name: '탈주 기록' }).getByRole('row').filter({ hasText: reason });
    await expect(async () => {
        await openMember(page, account);
        await expect(row).toHaveCount(1, { timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    return row;
}

test('A09-E-091 관리자 회원 상세, 산 채로 나간 계정 → 탈주 기록에 "산 채로 나감"·"막힘 중" @game @smoke', async ({ page, table }) => {
    const { t, citizen } = await botTable(table, 5);
    await K.toDay(t);
    const reply = await citizen.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, '나가기를 서버가 받음').toBe(true);

    await loginAsAdmin(page, await createAdmin());
    const row = await desertionRow(page, citizen.account, '산 채로 나감');
    await expectReadable(row.getByText('산 채로 나감', { exact: true }));
    await expectReadable(row.getByText('막힘 중', { exact: true }));
    // 어느 판에서 탈주했는지도 그 줄에 있음
    await expect(row).toContainText(t.gameId);
});

test('A09-E-092 관리자 회원 상세, 끊긴 뒤 60초(손잡이) 못 돌아온 계정 → "끊긴 뒤 1분 안에 못 돌아옴" @game', async ({ page, table }) => {
    const { t, citizen } = await botTable(table, 6);
    await K.toDay(t);
    const since = Date.now();
    K.dropBot(citizen);
    await K.droppedAt(t, K.U(citizen), since);
    await K.expire(t, K.U(citizen));

    await loginAsAdmin(page, await createAdmin());
    const row = await desertionRow(page, citizen.account, '끊긴 뒤 1분 안에 못 돌아옴');
    await expectReadable(row.getByText('끊긴 뒤 1분 안에 못 돌아옴', { exact: true }));
    await expectReadable(row.getByText('막힘 중', { exact: true }));
    await expect(row).not.toContainText('산 채로 나감');
});

test('A09-E-093 관리자 회원 상세, 탈주 없는 계정 → "탈주 기록이 없어요."', async ({ page, accounts }) => {
    const member = await accounts.create();
    await loginAsAdmin(page, await createAdmin());
    await openMember(page, member);
    await expectReadable(page.getByText('탈주 기록이 없어요.', { exact: true }));
    await expect(page.getByRole('table', { name: '탈주 기록' })).toHaveCount(0);
});
