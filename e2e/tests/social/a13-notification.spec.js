'use strict';

// 알림 창 브라우저 시험 (PC) — 열면 배지 0·읽은 메시지 삭제·지운 환영 안내는 다시 안 생김·삭제 단추 꺼짐·설정에서 끈 종류 숨김·업적 알림 → 기억의 서고·문의 답 알림 → 그 문의·받기 실패 글·빈 글·닫으면 포커스 돌아감
// 목록 A13-친구-알림-초대.md 번호 A13-E-041~050 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-notification.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const db = require('../../helpers/db');
const { createAdmin } = require('../../helpers/adminAccounts');
const K = require('./_a13-kit');

const { U, TEXT } = K;

// 목록을 다 받은 본문 (빈 글 또는 줄 목록)
const loadedBody = (page) => K.noticeDialog(page).locator('[data-notification-state="empty"], [data-notification-state="list"]');

/** 알림 0개에서 시작하는 사람 (rows: 미리 넣을 알림 값들) → { person, ids } */
async function quietPerson(accounts, players, rows = []) {
    const account = await K.quietAccount(accounts);
    const ids = [];
    for (const row of rows) ids.push(await K.insertNotice(account.uuid, row));
    const person = await players.add({ account });
    return { person, ids };
}

test('A13-E-041 안 읽음 2 → 알림 창 열기 → 배지 없음, DB 두 줄 read_at 채움 @smoke', async ({ accounts, players }) => {
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

test('A13-E-042 읽은 알림 2 → "읽은 메시지 삭제" → 읽은 줄 없음, 새로고침해도 없음', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players, [{ read: true }, { read: true }]);
    const page = person.page;
    await K.openNotices(page);
    await expect(K.noticeRows(page)).toHaveCount(2);

    await K.noticeDialog(page).getByRole('button', { name: TEXT.deleteRead }).click();
    await expect(K.noticeRows(page)).toHaveCount(0);

    await ui.gotoLobby(page);
    await K.openNotices(page);
    await expect(loadedBody(page)).toBeVisible();
    await expect(K.noticeRows(page)).toHaveCount(0);
});

test('A13-E-043 환영 안내 읽고 삭제 → 로그아웃·로그인 → 목록에 "알림 기능 안내" 없음', async ({ user }) => {
    const page = user.page;
    await K.openNotices(page);
    await expect(K.noticeRowOf(page, TEXT.welcome)).toHaveCount(1);
    await K.noticeDialog(page).getByRole('button', { name: TEXT.deleteRead }).click();
    await expect(K.noticeRowOf(page, TEXT.welcome)).toHaveCount(0);

    // 로그아웃(쿠키 지움) → 로그인 화면으로 다시 로그인
    await user.context.clearCookies();
    await ui.loginViaUi(page, user.account);
    await ui.skipIntro(page);
    await K.openNotices(page);
    await expect(loadedBody(page)).toBeVisible();
    await expect(K.noticeRowOf(page, TEXT.welcome)).toHaveCount(0);
});

test('A13-E-044 알림 0 → "읽은 메시지 삭제" 꺼짐', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players);
    const page = person.page;
    await K.openNotices(page);
    await expect(loadedBody(page)).toBeVisible();
    await expect(K.noticeDialog(page).getByRole('button', { name: TEXT.deleteRead })).toBeDisabled();
});

test('A13-E-045 환경설정에서 게임 초대 알림 끔 → 봇 초대 → 알림 창에 초대 줄 없음, 배지 안 셈', async ({ accounts, players, bots }) => {
    const { person } = await quietPerson(accounts, players);
    const page = person.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(person, bot);
    await K.turnOffNotice(page, '게임 초대');

    const room = await K.botRoom(bot);
    await K.botInvite(bot, person, room);
    await K.waitNoticeRow(U(person), 'game-invite');
    // 받은 뒤 다시 들어와 목록에 그 줄이 들어온 상태에서 봄
    await ui.gotoLobby(page);
    await expect(K.noticeEntry(page)).toHaveAttribute('data-notification-unread-count', '0');
    await K.openNotices(page);
    await expect(loadedBody(page)).toBeVisible();
    await expect(K.noticeDialog(page).locator('[data-notification-type="game-invite"]')).toHaveCount(0);
});

test('A13-E-046 DB에 업적 알림 → "기억의 서고에서 보기" → 기억의 서고 화면', async ({ accounts, players }) => {
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

test('A13-E-047 DB에 문의·운영팀 답·답 알림 → 알림 누름 → 문의 창에 그 답과 "운영팀"', async ({ accounts, players }) => {
    const account = await K.quietAccount(accounts);
    const admin = await createAdmin();
    const replyText = `답 ${Date.now().toString(36)} 확인했어요`;
    await db.query(
        "INSERT INTO inquiries (user_id, category, title, body, status, created_at, updated_at, answered_at) VALUES (?, 'BUG', '판이 멈춤', '낮에 멈췄어요', 'ANSWERED', ?, ?, ?)",
        [account.uuid, new Date(), new Date(), new Date()],
    );
    const [{ id: inquiryId }] = await db.query('SELECT id FROM inquiries WHERE user_id = ? ORDER BY id DESC LIMIT 1', [account.uuid]);
    await db.query('INSERT INTO inquiry_replies (inquiry_id, admin_id, body, created_at) VALUES (?, ?, ?, ?)', [inquiryId, admin.id, replyText, new Date()]);
    const [{ id: replyId }] = await db.query('SELECT id FROM inquiry_replies WHERE inquiry_id = ? ORDER BY id DESC LIMIT 1', [inquiryId]);
    await K.insertNotice(account.uuid, {
        type: 'system', title: '문의 답이 왔어요', body: '운영팀이 문의에 답했습니다.',
        target: { kind: 'inquiry', inquiryId: Number(inquiryId) }, sourceKey: `inquiry-reply:${replyId}`,
    });
    const person = await players.add({ account });
    const page = person.page;

    await K.openNotices(page);
    await K.noticeRowOf(page, '문의 답이 왔어요').getByRole('button', { name: '문의 답 보기' }).click();
    const detail = page.getByTestId('inquiry-detail');
    await expect(detail).toContainText(replyText);
    await expect(detail).toContainText(TEXT.replyFrom);
});

test('A13-E-048 알림 목록 요청을 막음 → "알림을 불러오지 못했습니다." 읽힘 + "다시 시도"', async ({ accounts, players }) => {
    const account = await K.quietAccount(accounts);
    const person = await players.add({ account, lobby: false });
    const page = person.page;
    // 알림 목록만 서버 오류로 (다른 요청은 그대로)
    await page.route((url) => url.pathname === '/notifications', (route) => (
        route.request().method() === 'GET'
            ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
            : route.continue()
    ));
    await ui.gotoLobby(page);

    await K.openNotices(page);
    await expectReadable(K.noticeDialog(page).getByText(TEXT.noticeFail, { exact: true }));
    await expect(K.noticeDialog(page).getByRole('button', { name: '다시 시도' })).toBeVisible();
});

test('A13-E-049 알림 0개 → "표시할 알림이 없습니다." 읽힘', async ({ accounts, players }) => {
    const { person } = await quietPerson(accounts, players);
    const page = person.page;
    await K.openNotices(page);
    await expectReadable(K.noticeDialog(page).getByText(TEXT.noticeEmpty, { exact: true }));
});

test('A13-E-050 키보드로 알림 창 열고 Esc → 포커스가 알림 단추로', async ({ user }) => {
    const page = user.page;
    const entry = K.noticeEntry(page);
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(K.noticeDialog(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(K.noticeDialog(page)).toHaveCount(0);
    await expect(entry).toBeFocused();
});
