'use strict';

// 친구 신청 어려움 브라우저 시험 (PC, 사람 2) — 두 사람이 서로 같은 순간 신청, PC에서 신청하고 모바일에서 수락, 수락과 취소를 같은 순간
// 목록 A13-친구-알림-초대.md 번호 A13-H-001·002·501 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-friend.hard.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const friends = require('../../helpers/friends');
const db = require('../../helpers/db');
const K = require('./_a13-kit');

const { U, TEXT, nickOf } = K;

test('A13-H-001 사람 2명이 두 화면에서 서로 같은 순간 친구 신청 → 한쪽 "이미 친구 신청 중입니다.", 다른 쪽 받은 신청 1 → 받기 → 두 화면 친구 목록에 서로 1줄 @hard @smoke', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add();
    await K.search(a.page, nickOf(b));
    await K.search(b.page, nickOf(a));
    const rowOnA = K.candidateRow(a.page, U(b));
    const rowOnB = K.candidateRow(b.page, U(a));
    await expect(rowOnA).toBeVisible();
    await expect(rowOnB).toBeVisible();

    await Promise.all([K.sendButton(rowOnA, nickOf(b)).click(), K.sendButton(rowOnB, nickOf(a)).click()]);
    await expect.poll(async () => (await K.pendingBetween(a, b)).length, { message: '기다리는 신청 줄 수' }).toBe(1);
    const [pending] = await K.pendingBetween(a, b);
    const winner = pending.requester_id === U(a) ? a : b;
    const loser = winner === a ? b : a;
    const loserRow = loser === a ? rowOnA : rowOnB;
    await expect(loserRow.getByText(TEXT.pendingDup, { exact: true })).toBeVisible();

    await K.openTab(loser.page, '요청 수락');
    await expect(K.requestRow(loser.page, nickOf(winner))).toHaveCount(1);
    await K.panel(loser.page).getByRole('button', { name: `${nickOf(winner)} 수락`, exact: true }).click();

    await K.showList(a.page);
    await K.showList(b.page);
    await expect(K.friendRow(a.page, U(b))).toHaveCount(1);
    await expect(K.friendRow(b.page, U(a))).toHaveCount(1);
});

test('A13-H-002 A(PC) 신청 → B(모바일) 수락 → A 화면 친구 목록에 새로고침 없이 B @hard', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add({ mobile: true });
    await K.search(a.page, nickOf(b));
    const row = K.candidateRow(a.page, U(b));
    await K.sendButton(row, nickOf(b)).click();
    await expect(row.getByRole('button', { name: TEXT.sentDone })).toBeVisible();
    await K.showList(a.page);

    await K.openTab(b.page, '요청 수락');
    await K.panel(b.page).getByRole('button', { name: `${nickOf(a)} 수락`, exact: true }).click();
    await expect(K.requestRow(b.page, nickOf(a))).toHaveCount(0);

    await expect(K.friendRow(a.page, U(b))).toBeVisible();
});

// ── 2026-11-16 새로 만든 기능 (친구 신청 취소) ──

test('A13-H-501 A가 보낸 신청을 B는 수락·A는 취소를 같은 순간 누름 → 두 화면이 같은 결과(둘 다 친구 1줄 / 둘 다 친구·신청 줄 없음), DB ACCEPTED면 친구 줄 1·CANCELLED면 0 @hard', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add();
    await friends.api(a, 'POST', '/friends/requests', { receiverId: U(b) });
    await K.openTab(b.page, '요청 수락');
    const incomingRow = K.requestRow(b.page, nickOf(a));
    await expect(incomingRow).toHaveCount(1);
    await K.openTab(a.page, '친구 추가');
    const sentRow = K.panel(a.page).locator('li[data-outgoing-request-id]').filter({ hasText: nickOf(b) });
    await expect(sentRow).toHaveCount(1);

    await Promise.all([
        K.panel(b.page).getByRole('button', { name: `${nickOf(a)} 수락`, exact: true }).click(),
        sentRow.getByRole('button', { name: `${nickOf(b)}에게 보낸 친구 신청 취소`, exact: true }).click(),
    ]);
    // 끝난 상태가 정해질 때까지
    let status = null;
    await expect.poll(async () => {
        [status] = (await K.requestStatuses(a, b)).slice(-1);
        return status;
    }, { message: 'DB 신청 상태' }).not.toBe('PENDING');
    const [{ n }] = await db.query(
        'SELECT COUNT(*) AS n FROM friendships WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)',
        [U(a), U(b), U(b), U(a)],
    );

    // 진 쪽 화면: 실패 글이 뜨거나 줄이 사라짐
    const settled = async (row) => (await row.count()) === 0 || (await row.locator('[role="alert"]').count()) > 0;
    if (status === 'ACCEPTED') {
        expect(Number(n), '친구 줄').toBe(1);
        await expect.poll(() => settled(sentRow), { message: 'A 화면 보낸 신청 줄' }).toBe(true);
        await K.showList(a.page);
        await K.showList(b.page);
        await expect(K.friendRow(a.page, U(b))).toHaveCount(1);
        await expect(K.friendRow(b.page, U(a))).toHaveCount(1);
    } else {
        expect(status, '수락 아니면 취소').toBe('CANCELLED');
        expect(Number(n), '친구 줄').toBe(0);
        await expect.poll(() => settled(incomingRow), { message: 'B 화면 받은 신청 줄' }).toBe(true);
        await expect(sentRow).toHaveCount(0);
        await K.showList(a.page);
        await K.showList(b.page);
        await expect(K.friendRow(a.page, U(b))).toHaveCount(0);
        await expect(K.friendRow(b.page, U(a))).toHaveCount(0);
    }
});
