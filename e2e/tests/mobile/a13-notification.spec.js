'use strict';

// 모바일 알림 시트 브라우저 시험 — 열면 배지 0·읽은 메시지 삭제·삭제 단추 꺼짐·받기 실패 글·빈 글·업적 알림 → 기억의 서고·설정에서 끈 친구 신청 알림 숨김
// 목록 A13-친구-알림-초대.md 번호 A13-E-085~091 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-notification.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const K = require('../social/_a13-kit');

const { U, TEXT } = K;

// 목록을 다 받은 본문 (빈 글 또는 줄 목록)
const loadedBody = (page) => K.noticeDialog(page).locator('[data-notification-state="empty"], [data-notification-state="list"]');

/** 알림 0개에서 시작하는 모바일 사람 (rows: 미리 넣을 알림 값들) → { person, ids } */
async function quietPerson(accounts, players, rows = [], o = {}) {
    const account = await K.quietAccount(accounts);
    const ids = [];
    for (const row of rows) ids.push(await K.insertNotice(account.uuid, row));
    const person = await players.add({ account, mobile: true, ...o });
    return { person, ids };
}

test('A13-E-085 모바일 안 읽음 2 → 알림 시트 열기 → 배지 없음 @smoke', async ({ accounts, players }) => {
    const { person, ids } = await quietPerson(accounts, players, [{}, {}]);
    const page = person.page;
    await expect(K.noticeEntry(page)).toHaveAttribute('data-notification-unread-count', '2');

    await K.openNotices(page);
    await expect(K.noticeRows(page)).toHaveCount(2);
    await expect(K.noticeEntry(page)).toHaveAttribute('data-notification-unread-count', '0');
    await K.closeNotices(page);
    await expect(K.noticeEntry(page)).toHaveAccessibleName('알림');
    await expect.poll(async () => (await K.readTimes(ids)).filter(Boolean).length, { message: 'DB 읽은 줄 수' }).toBe(2);
});

test('A13-E-086 모바일 읽은 알림 2 → "읽은 메시지 삭제" → 읽은 줄 없음', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players, [{ read: true }, { read: true }]);
    const page = person.page;
    await K.openNotices(page);
    await expect(K.noticeRows(page)).toHaveCount(2);

    await K.noticeDialog(page).getByRole('button', { name: TEXT.deleteRead }).click();
    await expect(K.noticeRows(page)).toHaveCount(0);
});

test('A13-E-087 모바일 알림 0 → "읽은 메시지 삭제" 꺼짐', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players);
    const page = person.page;
    await K.openNotices(page);
    await expect(loadedBody(page)).toBeVisible();
    await expect(K.noticeDialog(page).getByRole('button', { name: TEXT.deleteRead })).toBeDisabled();
});

test('A13-E-088 모바일 알림 목록 요청을 막음 → "알림을 불러오지 못했습니다." 읽힘', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players, [], { lobby: false });
    const page = person.page;
    await page.route((url) => url.pathname === '/notifications', (route) => (
        route.request().method() === 'GET'
            ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
            : route.continue()
    ));
    await ui.gotoLobby(page);

    await K.openNotices(page);
    await expectReadable(K.noticeDialog(page).getByText(TEXT.noticeFail, { exact: true }));
});

test('A13-E-089 모바일 알림 0개 → "표시할 알림이 없습니다." 읽힘', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players);
    const page = person.page;
    await K.openNotices(page);
    await expectReadable(K.noticeDialog(page).getByText(TEXT.noticeEmpty, { exact: true }));
});

test('A13-E-090 모바일 DB에 업적 알림 → "기억의 서고에서 보기" 탭 → 서고 화면', async ({ accounts, players }) => {
    const achievementId = `e2e-ach-${Date.now().toString(36)}`;
    const { person } = await quietPerson(accounts, players, [{
        type: 'achievement',
        title: '업적 달성',
        body: '새 업적을 달성해 보상을 받았습니다. 기억의 서고에서 확인하세요.',
        target: { kind: 'achievement', achievementId },
        sourceKey: `achievement:${achievementId}:granted`,
    }]);
    const page = person.page;
    await K.openNotices(page);
    await K.noticeRowOf(page, '업적 달성').getByRole('button', { name: '기억의 서고에서 보기' }).click();
    await expect(page).toHaveURL(/\/library/);
});

test('A13-E-091 모바일 설정에서 친구 신청 알림("친구 초대") 끔 → 봇 신청 → 알림 시트에 그 줄 없음', async ({ accounts, players, bots }) => {
    const { person } = await quietPerson(accounts, players);
    const page = person.page;
    await K.turnOffNotice(page, '친구 초대');
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, person);
    await K.waitNoticeRow(U(person), 'friend-request');

    // 받은 뒤 다시 들어와 목록에 그 줄이 들어온 상태에서 봄
    await ui.gotoLobby(page);
    await K.openNotices(page);
    await expect(loadedBody(page)).toBeVisible();
    await expect(K.noticeDialog(page).locator('[data-notification-type="friend-request"]')).toHaveCount(0);
});
