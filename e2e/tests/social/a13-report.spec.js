'use strict';

// 신고 보내기 브라우저 시험 (PC) — 판 중 전적 목록에서 신고 접수 글·신고됨·다른 탭에서 이미 신고·기타는 메모 꼭·메모 500자·1분 6번째·결과 화면 신고·내 줄엔 신고 없음·취소면 안 보냄·사유 글 읽힘
// 목록 A13-친구-알림-초대.md 번호 A13-E-051~060 (증거는 A06, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-report.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable, expectAllReadable } = require('../../helpers/visible');
const { waitResult, resultRow } = require('../room/roomHelpers');
const K = require('./_a13-kit');

const { TEXT } = K;

// 판 시험은 차리는 데 오래 걸려 넉넉히
const GAME_MS = 180_000;

test('A13-E-051 6명 판 중 전적 목록 봇 줄 "신고" → 욕설 → 신고하기 → 접수 글 읽힘, 그 줄 "신고됨" @game @smoke', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 6);
    const target = t.bots[0];

    await K.openReport(page, target.nickname);
    await K.submitReport(page, '욕설');
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportSent);
    await expectReadable(K.reportMessage(page));
    await K.closeReport(page);

    const sheet = await K.openRecords(page);
    await expect(sheet.getByRole('button', { name: `${target.nickname} 신고됨`, exact: true })).toBeVisible();
});

test('A13-E-052 7명 판 접수 뒤 같은 줄 → "신고됨" 단추 꺼짐 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 7);
    const target = t.bots[1];

    await K.openReport(page, target.nickname);
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportSent);
    await K.closeReport(page);

    const sheet = await K.openRecords(page);
    await expect(sheet.getByRole('button', { name: `${target.nickname} 신고됨`, exact: true })).toBeDisabled();
});

test('A13-E-053 8명 판 API로 먼저 신고 뒤 화면에서 같은 대상 신고 → "이미 이 판에서 신고한 플레이어입니다." 읽힘, 줄 "신고됨" @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 8);
    const target = t.bots[2];
    await K.apiReport(user, target, t.gameId);

    await K.openReport(page, target.nickname);
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportDup);
    await expectReadable(K.reportMessage(page));
    await K.closeReport(page);
    const sheet = await K.openRecords(page);
    await expect(sheet.getByRole('button', { name: `${target.nickname} 신고됨`, exact: true })).toBeVisible();
});

test('A13-E-054 5명 판 기타 + 빈 메모 → "기타 사유는 메모를 적어 주세요." 읽힘, 신고 요청 0 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 5);
    const sent = K.countReports(page);

    await K.openReport(page, t.bots[0].nickname);
    await K.submitReport(page, '기타');
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportNeedMemo);
    await expectReadable(K.reportMessage(page));
    expect(sent.n, '보낸 신고 요청').toBe(0);
});

test('A13-E-055 5명 판 메모에 501자 붙여 넣기 → 501자째가 안 들어가거나 "메모는 500자까지 적을 수 있습니다." 보임, 신고 요청 0 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 5);
    const sent = K.countReports(page);

    const dialog = await K.openReport(page, t.bots[0].nickname);
    const memo = dialog.getByRole('textbox', { name: '메모' });
    await memo.fill('가'.repeat(501));
    const length = (await memo.inputValue()).length;
    if (length > 500) await expect(dialog.getByText(TEXT.reportMemoLong, { exact: true })).toBeVisible();
    else expect(length, '메모 칸 글자 수').toBeLessThanOrEqual(500);
    expect(sent.n, '보낸 신고 요청').toBe(0);
});

test('A13-E-056 10명 판 1분 안에 5명 신고 뒤 6번째 → "신고가 너무 많습니다. 잠시 후 다시 시도해주세요." 읽힘 @game', async ({ user, table }) => {
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
    await expectReadable(K.reportMessage(page));
});

test('A13-E-057 5명 판 끝 → 결과 화면 참가자 목록 봇 줄 신고 → 접수 글 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 5, { toDay: false });
    const target = t.bots[0];
    await K.jokerQuits(t);
    await waitResult(page);

    await resultRow(page, target.nickname).getByRole('button', { name: `${target.nickname} 신고`, exact: true }).click();
    await expect(K.reportDialog(page)).toBeVisible();
    await K.submitReport(page);
    await expect(K.reportMessage(page)).toHaveText(TEXT.reportSent);
});

test('A13-E-058 7명 판 전적 목록 내 줄엔 "신고" 단추 없음 (남의 줄 6개에만) @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    await K.seatGame(table, user, 7);
    const sheet = await K.openRecords(page);

    await expect(sheet.getByTestId('report-row-button')).toHaveCount(6);
    await expect(sheet.getByRole('button', { name: `${user.account.nickname} 신고`, exact: true })).toHaveCount(0);
});

test('A13-E-059 8명 판 사유 고른 뒤 "취소" → 창 닫힘, POST /reports 0번 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 8);
    const sent = K.countReports(page);

    const dialog = await K.openReport(page, t.bots[3].nickname);
    await dialog.getByRole('radio', { name: '비매너', exact: true }).click();
    await dialog.getByTestId('report-cancel').click();
    await expect(K.reportDialog(page)).toHaveCount(0);
    expect(sent.n, '보낸 신고 요청').toBe(0);
});

test('A13-E-060 6명 판 신고 창 사유 4개 글이 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 6);

    const dialog = await K.openReport(page, t.bots[0].nickname);
    const reasons = dialog.getByRole('radio');
    await expect(reasons).toHaveText(['욕설', '비매너', '부정행위', '기타']);
    await expectAllReadable(reasons);
});
