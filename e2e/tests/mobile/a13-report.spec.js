'use strict';

// 모바일 신고 브라우저 시험 — 판 중 전적 시트에서 신고 접수 글·이미 신고한 대상·기타는 메모 꼭·결과 화면 신고·1분 6번째 신고
// 목록 A13-친구-알림-초대.md 번호 A13-E-092~096 (증거는 A06, 쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-report.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { resultRow } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');
const K = require('../social/_a13-kit');

const { TEXT } = K;

const GAME_MS = 180_000;

test('A13-E-092 모바일 6명 판 중 전적 시트 봇 줄 신고 → 접수 글 읽힘 @game @smoke @safari', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 6);

    await K.openReport(page, t.bots[0].nickname);
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportSent);
    await expectReadable(K.reportMessage(page));
});

test('A13-E-093 모바일 7명 판 API로 먼저 신고 뒤 같은 대상 → "이미 이 판에서 신고한 플레이어입니다." @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 7);
    const target = t.bots[1];
    await K.apiReport(user, target, t.gameId);

    await K.openReport(page, target.nickname);
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportDup);
});

test('A13-E-094 모바일 5명 판 기타 + 빈 메모 → "기타 사유는 메모를 적어 주세요." 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 5);

    await K.openReport(page, t.bots[0].nickname);
    await K.submitReport(page, '기타');
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportNeedMemo);
    await expectReadable(K.reportMessage(page));
});

test('A13-E-095 모바일 8명 판 끝 → 결과 목록 봇 줄 신고 → 접수 글 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 8, { toDay: false });
    const target = t.bots[0];
    await K.jokerQuits(t);
    await H.allAtResult([user]);

    await resultRow(page, target.nickname).getByRole('button', { name: `${target.nickname} 신고`, exact: true }).click();
    await expect(K.reportDialog(page)).toBeVisible();
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportSent);
});

test('A13-E-096 모바일 10명 판 1분 안에 5명 신고 뒤 6번째 → "신고가 너무 많습니다. 잠시 후 다시 시도해주세요." @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seatGame(table, user, 10);

    for (const bot of t.bots.slice(0, 5)) {
        await K.openReport(page, bot.nickname);
        await K.submitReport(page);
        await expect(K.reportMessage(page)).toHaveText(TEXT.reportSent);
        await K.closeReport(page);
    }
    await K.openReport(page, t.bots[5].nickname);
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportRate);
});
