'use strict';

// 관리자 회원 찾기·상세 브라우저 시험 (PC 크기) — 닉네임 앞 2자·UUID로 찾기, 없음·탈퇴함 글, 가린 이메일 → 이메일 보기 기록, 지난 판 전적, 탈주 기록 칸
// 목록 시험목록/A14-관리자.md 번호 A14-E-014~020 — 돌리지 않고 모임만: npx playwright test --list tests/admin/a14-members.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const { playToResult } = require('../room/roomHelpers');
const k = require('./_a14-kit');

const { E, U, NICK } = k;
const searchBox = (page) => page.getByRole('search').getByLabel('찾을 회원');
// 관리자 지난 판 화면의 직업 이름 (frontend/src/admin/domains/games/labels.js — 시민 직업은 "귀족", 2026-11-16 사용자 결정)
const ADMIN_ROLE = Object.freeze({ JOKER: '광대', CITIZEN: '귀족' });

// 회원 화면에서 찾기 → 찾은 회원 목록 줄
async function search(page, word) {
    await k.goMenu(page, '회원');
    await expect(k.heading(page, '회원')).toBeVisible();
    await searchBox(page).fill(word);
    await page.getByRole('search').getByRole('button', { name: '찾기' }).click();
    return k.listRows(page, '찾은 회원 목록');
}

test(`${E(14)} 닉네임 앞 2자 → 그 회원 → 상세, 로비에 있는 플레이어는 "접속 중" @smoke`, async ({ browser, accounts, players }) => {
    const account = await accounts.create({ nickname: k.uniqueNickname() });
    await k.openPlayer(players, { account });
    const w = await k.openAdmin(browser);
    try {
        const rows = await search(w.page, account.nickname.slice(0, 2));
        const row = rows.filter({ hasText: account.nickname });
        await expect(row).toHaveCount(1);
        await expectReadable(row.getByText('접속 중', { exact: true }));
        await row.getByRole('link', { name: account.nickname }).click();
        await expect(w.page).toHaveURL(new RegExp(`/members/${account.uuid}`));
        await expectReadable(k.heading(w.page, account.nickname));
        await expect(w.page.getByText('접속 중', { exact: true }).first()).toBeVisible();
    } finally {
        await w.close();
    }
});

test(`${E(15)} UUID로 찾기 → 상세`, async ({ browser, accounts }) => {
    const account = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const rows = await search(w.page, account.uuid);
        await expect(rows).toHaveCount(1);
        await rows.getByRole('link', { name: account.nickname }).click();
        await expectReadable(k.heading(w.page, account.nickname));
        await expect(w.page.getByText(account.uuid).first()).toBeVisible();
    } finally {
        await w.close();
    }
});

test(`${E(16)} 없는 닉네임 → "없음" 글이 읽힘`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        await search(w.page, k.uniqueNickname());
        await expectReadable(w.page.getByText(/^없음 — 이 말로 찾은 회원이 없어요\./));
    } finally {
        await w.close();
    }
});

test(`${E(17)} 탈퇴한 계정 → "탈퇴함"`, async ({ browser, accounts }) => {
    const account = await accounts.create();
    await query("UPDATE users SET status = 'WITHDRAWN' WHERE uuid = ?", [account.uuid]);
    const w = await k.openAdmin(browser);
    try {
        const rows = await search(w.page, account.uuid);
        await expect(rows).toHaveCount(1);
        await expectReadable(rows.getByText('탈퇴함', { exact: true }));
        await rows.getByRole('link', { name: account.nickname }).click();
        await expectReadable(w.page.getByText('탈퇴한 회원이에요.', { exact: true }));
    } finally {
        await w.close();
    }
});

test(`${E(18)} 목록 이메일은 가림 → 상세 "이메일 보기" → 전체, 처리 이력에 "이메일 전체 보기"`, async ({ browser, accounts }) => {
    const account = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const rows = await search(w.page, account.uuid);
        // 결정 2026-11-16 아침 20번: 지금 가림 모양 그대로 (앞은 첫·끝 글자, 뒤는 첫 글자와 끝말)
        await expect(rows.getByText(k.maskedEmail(account.email), { exact: true })).toBeVisible();
        await expect(rows).not.toContainText(account.email);
        await rows.getByRole('link', { name: account.nickname }).click();
        await expect(k.heading(w.page, account.nickname)).toBeVisible();
        await w.page.getByRole('button', { name: '이메일 보기' }).click();
        await expectReadable(w.page.getByText(account.email, { exact: true }));

        const audit = await k.auditRows(w.page, w.admin);
        const line = audit.filter({ hasText: '이메일 전체 보기' });
        await expect(line).toHaveCount(1);
        await expect(line).toContainText(account.nickname);
    } finally {
        await w.close();
    }
});

test(`${E(19)} 그 회원이 끝까지 한 5명 판 → 지난 판에 그 판, 참가자 5명 직업(광대·귀족)·승패 @game`, async ({ browser, players, table }) => {
    const user = await k.openPlayer(players);
    // 사람 귀족 + 봇 광대 1·귀족 3, 봇 표로 광대 처형 → 시민 진영 승
    const { t, joker } = await playToResult({ user, table, kind: 'citizenWin' });
    const w = await k.openAdmin(browser);
    try {
        const rows = k.listRows(w.page, '지난 판 목록');
        // 판 결과 저장이 조금 늦을 수 있어 다시 읽으며
        await expect(async () => {
            await w.page.goto(`/games?userUuid=${U(user)}`);
            await expect(rows).toHaveCount(1, { timeout: 2000 });
        }).toPass({ timeout: 20_000 });
        await expect(rows).toContainText('5명');
        await rows.getByRole('link').first().click();
        await expect(w.page).toHaveURL(new RegExp(`/games/${t.gameId}`));
        const people = k.listRows(w.page, '참가자');
        await expect(people).toHaveCount(5);
        const everyone = [user, ...t.bots];
        for (const who of everyone) {
            const line = people.filter({ hasText: NICK(who) });
            const isJoker = U(who) === joker;
            await expect(line).toContainText(isJoker ? ADMIN_ROLE.JOKER : ADMIN_ROLE.CITIZEN);
            await expect(line.getByRole('cell').nth(3)).toHaveText(isJoker ? '패' : '승');
        }
        await expectReadable(people.filter({ hasText: NICK(user) }).getByRole('cell').nth(3));
    } finally {
        await w.close();
    }
});

test(`${E(20)} 탈주 없는 회원 상세 → "탈주 기록" 칸·"탈주 기록이 없어요."`, async ({ browser, accounts }) => {
    const account = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await k.openMember(w.page, account);
        await expectReadable(w.page.getByRole('heading', { level: 2, name: '탈주 기록', exact: true }));
        await expectReadable(w.page.getByText('탈주 기록이 없어요.', { exact: true }));
    } finally {
        await w.close();
    }
});
