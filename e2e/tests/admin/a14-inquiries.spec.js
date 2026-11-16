'use strict';

// 관리자 문의 브라우저 시험 (PC 크기) — 플레이어 문의가 "답 기다림" 목록에, 답하면 플레이어 알림 → 누르면 답·"답함"·"운영팀", 꺼진 동안 답한 알림, 빈 답 막기, 운영 현황 새 문의 수
// 목록 시험목록/A14-관리자.md 번호 A14-E-059~062 (062는 서버 전체 숫자라 @serial) — 모임만: npx playwright test --list tests/admin/a14-inquiries.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { E2E } = require('../../helpers/env');
const k = require('./_a14-kit');

const { E } = k;
const REPLIED_TITLE = '문의에 답이 왔어요';

// 문의 목록(답 기다림)에서 그 제목 줄 → 눌러 문의 하나 화면
async function openInquiry(page, title) {
    await k.goMenu(page, '문의');
    await expect(k.heading(page, '문의')).toBeVisible();
    const row = k.listRows(page, '문의 목록').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole('link', { name: title }).click();
    await expect(k.heading(page, title)).toBeVisible();
    return row;
}

// 답 적고 "답 보내기" → 보냄 안내
async function reply(page, text) {
    await page.getByLabel('답', { exact: true }).fill(text);
    await page.getByRole('button', { name: '답 보내기' }).click();
    await expect(page.getByRole('status').filter({ hasText: '답을 달았어요.' })).toBeVisible();
}

// 플레이어 알림 창에서 문의 답 알림 (본문 = 문의 제목)
async function replyNotice(page, inquiryTitle) {
    const bell = await k.openBell(page);
    const item = k.bellItems(bell, inquiryTitle).filter({ hasText: REPLIED_TITLE });
    await expect(item).toHaveCount(1);
    return item;
}

test(`${E(59)} 플레이어 문의 → 관리자 목록 "답 기다림" → 답 → 플레이어 알림 → 누르면 답·"답함"·"운영팀" @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const { title } = await k.createInquiry(player);
    const answer = `확인했어요 ${k.rand()}`;
    const w = await k.openAdmin(browser);
    try {
        await k.goMenu(w.page, '문의');
        const row = k.listRows(w.page, '문의 목록').filter({ hasText: title });
        await expect(row).toContainText('답 기다림');
        await expectReadable(row.getByText('답 기다림', { exact: true }));
        await openInquiry(w.page, title);
        await reply(w.page, answer);
    } finally {
        await w.close();
    }
    const item = await replyNotice(player.page, title);
    await expectReadable(item.getByText(REPLIED_TITLE, { exact: true }));
    await expect(item).toHaveAttribute('data-notification-read', 'true');
    const open = item.getByRole('button', { name: '문의 답 보기' });
    await expect(open).toBeEnabled();
    await open.click();
    const detail = player.page.getByTestId('inquiry-detail');
    await expect(detail).toContainText('답함');
    const replies = detail.getByRole('list', { name: '운영팀 답' });
    await expect(replies).toContainText(answer);
    await expect(replies).toContainText('운영팀');
    await expectReadable(replies.getByText(answer, { exact: true }));
});

test(`${E(60)} 플레이어 로그아웃 → 답 → 다시 로그인 → 알림 있음`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const { title } = await k.createInquiry(player);
    // 로그아웃하고 창도 닫음 (접속 없음)
    await k.playerCall(player, 'POST', '/auth/logout');
    await player.context.close();
    const w = await k.openAdmin(browser);
    try {
        await openInquiry(w.page, title);
        await reply(w.page, '꺼진 동안 단 답');
    } finally {
        await w.close();
    }
    const back = await players.add({ mobile: false, account: player.account });
    await expect(back.page).toHaveURL(new RegExp(`^${E2E.desktopUrl}/lobby`));
    const item = await replyNotice(back.page, title);
    await expectReadable(item.getByText(REPLIED_TITLE, { exact: true }));
});

test(`${E(61)} 답 빈 칸 → "답 보내기" 꺼짐`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const { title } = await k.createInquiry(player);
    const w = await k.openAdmin(browser);
    try {
        await openInquiry(w.page, title);
        const send = w.page.getByRole('button', { name: '답 보내기' });
        await expect(send).toBeDisabled();
        await w.page.getByLabel('답', { exact: true }).fill('   ');
        await expect(send).toBeDisabled();
        await w.page.getByLabel('답', { exact: true }).fill('답');
        await expect(send).toBeEnabled();
    } finally {
        await w.close();
    }
});

test(`${E(62)} 문의 하나 → 운영 현황 "새 문의" +1 @serial`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        const card = w.page.getByRole('listitem').filter({ has: w.page.getByRole('heading', { name: '새 문의', exact: true }) });
        const count = async () => Number((await card.locator('p').first().innerText()).replace(/[^\d]/g, ''));
        await k.goMenu(w.page, '운영 현황');
        await expect(card).toBeVisible();
        const before = await count();
        await k.createInquiry(player);
        await w.page.reload();
        await expect.poll(count, { message: '새 문의 수' }).toBe(before + 1);
        await expectReadable(card.locator('p').first());
    } finally {
        await w.close();
    }
});
