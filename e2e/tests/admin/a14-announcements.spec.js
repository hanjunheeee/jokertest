'use strict';

// 관리자 공지 브라우저 시험 (PC 크기) — 고른 회원에게 보내면 플레이어 알림(종)에 제목, 결과 수(새로 보냄·실패), 두 번 눌러도 알림 하나, 처리 이력 공지 줄, 판 중 받기
// 목록 시험목록/A14-관리자.md 번호 A14-E-049~053 — 고른 사람에게만 보내 서버 전체엔 안 걸림 (접속 중 전체는 A14-H-005 @serial) / 모임만: npx playwright test --list tests/admin/a14-announcements.spec.js
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const k = require('./_a14-kit');

const { E, U } = k;
const result = (page) => page.getByRole('status', { name: '발송 결과' });
// 발송 결과 칸 숫자 (예: '새로 보냄' → 1)
const resultValue = (page, label) => result(page).locator('div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');

// 공지 화면 → 제목·본문 → "고른 사람" → 고르기(fn) → 보내기 → 확인 창
async function draft(page, { title, body = '시험 공지 본문' }, pick) {
    await k.goMenu(page, '공지');
    await expect(k.heading(page, '공지')).toBeVisible();
    await page.getByLabel('제목', { exact: true }).fill(title);
    await page.getByLabel('본문', { exact: true }).fill(body);
    await page.getByRole('radio', { name: '고른 사람' }).check();
    await pick(page);
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    const box = k.dialog(page, '이 공지를 보낼까요?');
    await expect(box).toBeVisible();
    return box;
}

// 받을 사람 찾기 칸에 UUID → "이 UUID 그대로 넣기"
async function addUuid(page, uuid) {
    await page.getByLabel('받을 사람 찾기', { exact: true }).fill(uuid);
    await page.getByRole('button', { name: '이 UUID 그대로 넣기' }).click();
}

// 받을 사람 찾기 칸에 닉네임 → 찾기 → 그 줄 "넣기"
async function addByNickname(page, nickname) {
    await page.getByLabel('받을 사람 찾기', { exact: true }).fill(nickname);
    await page.getByRole('button', { name: '찾기', exact: true }).click();
    await page.getByRole('list', { name: '찾은 회원' }).getByRole('listitem').filter({ hasText: nickname }).getByRole('button', { name: '넣기' }).click();
}

test(`${E(49)} 플레이어 1명 골라 공지 → 결과 "새로 보냄 1" → 플레이어 알림(종)에 제목 @smoke`, async ({ browser, accounts, players }) => {
    const player = await k.openPlayer(players, { account: await accounts.create({ nickname: k.uniqueNickname() }) });
    const title = `시험 공지 ${k.rand()}`;
    const w = await k.openAdmin(browser);
    try {
        const box = await draft(w.page, { title }, (page) => addByNickname(page, player.account.nickname));
        await expect(box).toContainText('대상: 고른 사람 1명');
        await box.getByRole('button', { name: '보내기', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(resultValue(w.page, '새로 보냄')).toHaveText('1');
        await expectReadable(resultValue(w.page, '새로 보냄'));

        const bell = await k.openBell(player.page);
        await expect(k.bellItems(bell, title)).toHaveCount(1);
        await expectReadable(k.bellItems(bell, title).getByText(title, { exact: true }));
    } finally {
        await w.close();
    }
});

test(`${E(50)} 고른 2명 + 없는 UUID 1 → "새로 보냄 2"·"실패 1"이 읽힘`, async ({ browser, accounts }) => {
    const [a, b] = await accounts.createMany(2);
    const w = await k.openAdmin(browser);
    try {
        const box = await draft(w.page, { title: `결과 수 ${k.rand()}` }, async (page) => {
            for (const uuid of [a.uuid, b.uuid, crypto.randomUUID()]) await addUuid(page, uuid);
        });
        await expect(box).toContainText('대상: 고른 사람 3명');
        await box.getByRole('button', { name: '보내기', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(resultValue(w.page, '새로 보냄')).toHaveText('2');
        await expect(resultValue(w.page, '실패')).toHaveText('1');
        await expectReadable(resultValue(w.page, '새로 보냄'));
        await expectReadable(resultValue(w.page, '실패'));
    } finally {
        await w.close();
    }
});

test(`${E(51)} 확인 창 "보내기" 빠르게 두 번 → 플레이어 알림 1개`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const title = `두 번 ${k.rand()}`;
    const w = await k.openAdmin(browser);
    try {
        const box = await draft(w.page, { title }, (page) => addUuid(page, U(player)));
        await box.getByRole('button', { name: '보내기', exact: true }).dblclick();
        await expect(box).toBeHidden();
        await expect(result(w.page)).toBeVisible();
        const bell = await k.openBell(player.page);
        await expect(k.bellItems(bell, title)).toHaveCount(1);
        // 늦게 오는 두 번째 알림이 없는지 창을 다시 열어 한 번 더
        // 창 안 "닫기" 단추로 닫음 ("알림 닫기"는 어두운 바탕 단추라 가운데가 창에 가려 못 누름)
        await bell.getByRole('button', { name: '닫기', exact: true }).click();
        await expect(bell).toHaveCount(0);
        await ui.gotoLobby(player.page);
        const again = await k.openBell(player.page);
        await expect(k.bellItems(again, title)).toHaveCount(1);
    } finally {
        await w.close();
    }
});

test(`${E(52)} 보낸 뒤 처리 이력 "공지 발송 이력" → 제목·대상·결과 수`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const title = `이력 공지 ${k.rand()}`;
    const w = await k.openAdmin(browser);
    try {
        const box = await draft(w.page, { title }, (page) => addUuid(page, member.uuid));
        await box.getByRole('button', { name: '보내기', exact: true }).click();
        await expect(box).toBeHidden();
        const rows = await k.auditRows(w.page, w.admin, { kind: '공지 발송 이력' });
        const line = rows.filter({ hasText: title });
        await expect(line).toHaveCount(1);
        await expect(line).toContainText('고른 사람 1명');
        await expect(line).toContainText(`${title} · 받는 사람 1 · 새로 보냄 1 · 중복 0 · 실패 0`);
        await expectReadable(line.getByText(`${title} · 받는 사람 1 · 새로 보냄 1 · 중복 0 · 실패 0`, { exact: true }));
    } finally {
        await w.close();
    }
});

test(`${E(53)} 사람 1 + 봇 7 = 8명 판 중 그 사람에게 공지 → 판 화면에서 알림을 받음 @game`, async ({ browser, table }) => {
    // 판 화면엔 알림 종이 없어서 그 창이 받은 소켓 알림(notification_created)으로 봄
    const player = await k.openWatchedPlayer(browser);
    const title = `판 중 공지 ${k.rand()}`;
    try {
        await A.openTable(table, { humans: [player], bots: 7, roles: A.plainRoles() });
        await expect(player.page).toHaveURL(/\/ingame/);
        const w = await k.openAdmin(browser);
        try {
            const box = await draft(w.page, { title }, (page) => addUuid(page, U(player)));
            await box.getByRole('button', { name: '보내기', exact: true }).click();
            await expect(resultValue(w.page, '새로 보냄')).toHaveText('1');
        } finally {
            await w.close();
        }
        await expect.poll(() => player.frames.some((f) => f.includes('notification_created') && f.includes(title)), {
            message: '판 화면 창이 공지 알림을 받음', timeout: 15_000,
        }).toBe(true);
        await expect(player.page).toHaveURL(/\/ingame/);
    } finally {
        await player.close();
    }
});
