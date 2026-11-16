'use strict';

// 관리자 처리 이력 브라우저 시험 (PC 크기) — 제재·해제 이력 두 줄(종류·사유), 회원으로 거르기, 기간 바꿈 줄 전후 값 펼치기, 로그인 줄
// 목록 시험목록/A14-관리자.md 번호 A14-E-075~078 — 다른 시험 기록과 안 섞이게 "누가"를 이 시험 관리자로 거름 / 모임만: npx playwright test --list tests/admin/a14-audit-logs.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a14-kit');

const { E, U } = k;

test(`${E(75)} 정지·해제 뒤 "제재·해제 이력" → 두 줄·종류·사유 @smoke`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const banReason = `정지 사유 ${k.rand()}`;
        const liftReason = `해제 사유 ${k.rand()}`;
        await k.confirmBan(w.page, await k.banUi(w.page, member, { days: 7, reason: banReason }));
        const lift = await k.reasonDialog(w.page, member, '제재 해제', '제재 해제', liftReason);
        await lift.getByRole('button', { name: '해제하기' }).click();
        await expect(lift).toBeHidden();

        const rows = await k.auditRows(w.page, w.admin, { kind: '제재·해제 이력' });
        await expect(rows).toHaveCount(2);
        const banned = rows.filter({ hasText: '정지 (기간 정지 7일)' });
        const lifted = rows.filter({ hasText: '정지 해제' });
        await expect(banned).toContainText(banReason);
        await expect(lifted).toContainText(liftReason);
        await expect(banned).toContainText(member.nickname);
        await expectReadable(lifted.getByText(liftReason, { exact: true }));
    } finally {
        await w.close();
    }
});

test(`${E(76)} 회원 닉네임으로 거름 → 그 회원 대상 줄만`, async ({ browser, accounts }) => {
    const mine = await accounts.create({ nickname: k.uniqueNickname() });
    const other = await accounts.create({ nickname: k.uniqueNickname() });
    const w = await k.openAdmin(browser);
    try {
        // 두 회원 이메일 보기 기록을 하나씩 남김
        for (const who of [mine, other]) await k.adminApi(w.page, 'POST', `/members/${U(who)}/reveal-email`);
        await k.goMenu(w.page, '처리 이력');
        await w.page.getByLabel('회원으로 찾기', { exact: true }).fill(mine.nickname.slice(0, 2));
        await w.page.getByRole('button', { name: '회원 찾기' }).click();
        await w.page.getByRole('list', { name: '찾은 회원' }).getByRole('listitem').filter({ hasText: mine.nickname })
            .getByRole('button', { name: '이 회원 이력' }).click();
        await expect(w.page.getByText(`회원: ${mine.nickname}`)).toBeVisible();
        const rows = k.listRows(w.page, '처리 이력');
        await expect(rows.filter({ hasText: '이메일 전체 보기' })).toHaveCount(1);
        await expect(rows.filter({ hasText: other.nickname })).toHaveCount(0);
        for (const row of await rows.all()) await expect(row).toContainText(mine.nickname);
    } finally {
        await w.close();
    }
});

test(`${E(77)} 기간 바꿈 줄 "전후 값 보기" 펼침 → 전·후 끝 시각`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const { ban } = await k.adminApi(w.page, 'POST', `/members/${U(member)}/bans`, { kind: 'PERIOD', days: 7, reason: '7일 정지' });
        const changed = await k.adminApi(w.page, 'PATCH', `/members/${U(member)}/bans/${ban.id}`, { kind: 'PERIOD', days: 1, reason: '하루로' });
        const rows = await k.auditRows(w.page, w.admin, { kind: '제재·해제 이력' });
        const line = rows.filter({ hasText: '정지 기간 바꿈' });
        await expect(line).toHaveCount(1);
        await line.getByText('전후 값 보기').click();
        const [before, after] = [line.locator('pre').nth(0), line.locator('pre').nth(1)];
        await expect(before).toBeVisible();
        await expect(before).toContainText(ban.endAt);
        await expect(after).toContainText(changed.ban.endAt);
        await expect(after).toContainText('"days": 1');
        await expectReadable(after);
    } finally {
        await w.close();
    }
});

test(`${E(78)} 로그인 → 처리 이력 맨 아래 쪽 "로그인" 줄·내 아이디`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        const rows = await k.auditRows(w.page, w.admin);
        const last = rows.last();
        await expect(last).toContainText('로그인');
        await expect(last).toContainText(w.admin.loginId);
        await expectReadable(last.getByRole('cell').filter({ hasText: /^로그인$/ }));
    } finally {
        await w.close();
    }
});
