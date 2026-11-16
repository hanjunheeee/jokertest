'use strict';

// 같은 판 서로 신고 어려움 브라우저 시험 (PC, 사람 2 + 봇 6 = 8명 판) — A가 B, B가 A를 신고하면 둘 다 접수(방향이 다르면 따로), A가 B를 다시 누르려 하면 "신고됨"
// 목록 A13-친구-알림-초대.md 번호 A13-H-010 (운영 1장 유일 묶음), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-report.hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const K = require('./_a13-kit');

const { U, TEXT, nickOf } = K;

test('A13-H-010 8명 판(사람 2 + 봇 6) A가 B, B가 A 신고 → 둘 다 접수 글, A가 B 다시 → "신고됨" @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const a = await players.add();
    const b = await players.add();
    const t = await table.setup({
        humans: [a, b], bots: 6, settings: K.ROOMY,
        roles: ({ bots }) => ({ [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN', [U(bots[5])]: 'JOKER' }),
    });
    const s = await t.state();
    expect(s.players, '판 인원').toHaveLength(8);
    await ui.readRoleReveal(a.page);
    await ui.readRoleReveal(b.page);
    await K.calmDay(t);

    await K.openReport(a.page, nickOf(b));
    await K.submitReport(a.page);
    await K.openReport(b.page, nickOf(a));
    await K.submitReport(b.page);
    await expect(K.reportMessage(a.page)).toHaveText(TEXT.reportSent);
    await expect(K.reportMessage(b.page)).toHaveText(TEXT.reportSent);

    await K.closeReport(a.page);
    const sheet = await K.openRecords(a.page);
    await expect(sheet.getByRole('button', { name: `${nickOf(b)} 신고됨`, exact: true })).toBeDisabled();
});
