'use strict';

// 관리자 신고 처리 브라우저 시험 (PC 크기) — 판에서 들어온 신고를 정지로 처리·기각, 채팅 증거 3줄, 증거 없음 글, 운영 현황 새 신고 수
// 목록 시험목록/A14-관리자.md 번호 A14-E-034~038 (038은 서버 전체 숫자라 @serial) — 돌리지 않고 모임만: npx playwright test --list tests/admin/a14-reports.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const N = require('../ingame/b-night/_night');
const L = require('../ingame/a-day/_lib');
const k = require('./_a14-kit');

const { E, NICK } = k;

// 사람 하나 + 봇 판 (사람 시민·첫 봇 광대), 첫날 낮까지 → { player, t }
async function dayTable(players, table, bots) {
    const player = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [player], bots, roles: A.plainRoles() });
    await N.toDay(t);
    await A.calm(player.page);
    return { player, t };
}

// 신고 목록(처리 전)에서 그 대상 줄 → 열기
async function openReportOf(page, target) {
    await k.goMenu(page, '신고');
    const row = k.listRows(page, '신고 목록').filter({ hasText: NICK(target) });
    await expect(row).toHaveCount(1);
    await row.getByRole('link', { name: '열기' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^신고 #\d+$/ })).toBeVisible();
    return row;
}

const facts = (page) => page.locator('dl').first();

test(`${E(34)} 사람 1 + 봇 5 = 6명 판에서 사람이 봇 신고 → 관리자 신고 목록 처리 전 → 상세 → 정지 → "처리됨" @game @smoke`, async ({ browser, players, table }) => {
    const { player, t } = await dayTable(players, table, 5);
    const target = t.bots[2];
    await k.reportInGame(player, { target, gameId: t.gameId });
    const w = await k.openAdmin(browser);
    try {
        await openReportOf(w.page, target);
        await w.page.getByRole('button', { name: '정지', exact: true }).click();
        const box = k.dialog(w.page, '정지하고 신고 처리');
        await box.getByLabel('정지 사유', { exact: true }).fill('욕설');
        await box.getByRole('button', { name: '정지', exact: true }).click();
        await expect(box).toBeHidden();
        await expectReadable(w.page.getByRole('status').filter({ hasText: '정지하고 신고를 처리했어요.' }));
        await expect(facts(w.page)).toContainText('처리됨');
        await expect(w.page.getByRole('button', { name: '정지', exact: true })).toHaveCount(0);
    } finally {
        await w.close();
    }
});

test(`${E(35)} 사람 1 + 봇 4 = 5명 판 신고 → 기각 → "기각"·처리 전 목록에서 빠짐 @game`, async ({ browser, players, table }) => {
    const { player, t } = await dayTable(players, table, 4);
    const target = t.bots[1];
    await k.reportInGame(player, { target, gameId: t.gameId });
    const w = await k.openAdmin(browser);
    try {
        await openReportOf(w.page, target);
        await w.page.getByRole('button', { name: '기각', exact: true }).click();
        const box = k.dialog(w.page, '신고 기각');
        await box.getByRole('button', { name: '기각', exact: true }).click();
        await expect(box).toBeHidden();
        await expectReadable(w.page.getByRole('status').filter({ hasText: '신고를 기각했어요.' }));
        await expect(facts(w.page)).toContainText('기각');
        await w.page.getByRole('link', { name: '목록으로' }).click();
        await expect(w.page.getByRole('button', { name: '처리 전', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(k.listRows(w.page, '신고 목록').filter({ hasText: NICK(target) })).toHaveCount(0);
    } finally {
        await w.close();
    }
});

test(`${E(36)} 사람 1 + 봇 6 = 7명 판 낮 채팅 3줄 뒤 신고 → 상세에 그 3줄·채널·시각 @game`, async ({ browser, players, table }) => {
    const { player, t } = await dayTable(players, table, 6);
    const target = t.bots[3];
    // 채팅 간격 규칙에 안 걸리게 봇 셋이 한 줄씩 (셋째 줄이 신고 대상)
    const senders = [t.bots[1], t.bots[2], target];
    const lines = senders.map((_, i) => `낮채팅${i + 1}-${k.rand()}`);
    for (const [i, text] of lines.entries()) {
        const reply = await L.botChat(t, senders[i], text);
        expect(reply?.ok, `봇 채팅 ${reply?.code ?? ''}`).toBe(true);
    }
    // 사람 화면에도 다 왔을 때 신고 (판 채팅 묶음에 들어간 뒤)
    for (const text of lines) await expect(L.chatLog(player.page)).toContainText(text);
    await k.reportInGame(player, { target, gameId: t.gameId });
    const w = await k.openAdmin(browser);
    try {
        await openReportOf(w.page, target);
        const evidence = w.page.getByRole('list', { name: '채팅 증거' });
        for (const text of lines) {
            const line = evidence.getByRole('listitem').filter({ hasText: text });
            await expect(line).toHaveCount(1);
            await expect(line).toContainText('[낮 대화]');
            await expect(line).toContainText(NICK(senders[lines.indexOf(text)]));
            await expect(line).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
        }
        await expectReadable(evidence.getByRole('listitem').filter({ hasText: lines[0] }));
    } finally {
        await w.close();
    }
});

test(`${E(37)} 증거 없이 넣은 신고 → 상세 "증거 없음"`, async ({ browser, accounts }) => {
    const [reporter, target] = await accounts.createMany(2);
    await k.insertReport({ reporter, target });
    const w = await k.openAdmin(browser);
    try {
        await openReportOf(w.page, target);
        await expectReadable(w.page.getByText(/^증거 없음 — 이 신고엔 저장된 채팅이 없어요\./));
    } finally {
        await w.close();
    }
});

test(`${E(38)} 신고 하나 더 → 운영 현황 "새 신고" +1 @serial`, async ({ browser, accounts }) => {
    const [reporter, target] = await accounts.createMany(2);
    const w = await k.openAdmin(browser);
    try {
        const card = w.page.getByRole('listitem').filter({ has: w.page.getByRole('heading', { name: '새 신고', exact: true }) });
        const count = async () => Number((await card.locator('p').first().innerText()).replace(/[^\d]/g, ''));
        await k.goMenu(w.page, '운영 현황');
        await expect(card).toBeVisible();
        const before = await count();
        await k.insertReport({ reporter, target });
        await w.page.reload();
        await expect.poll(count, { message: '새 신고 수' }).toBe(before + 1);
        await expectReadable(card.locator('p').first());
    } finally {
        await w.close();
    }
});
