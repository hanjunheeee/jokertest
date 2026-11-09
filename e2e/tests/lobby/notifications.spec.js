// 알림 창 시험: 환영 알림·읽음(열면 다 읽음)·읽은 것 지우기·관리자 공지가 알림으로 옴·종류별 숨김 설정·닫기
// 공지는 고른 사람에게만 보내는 internal.announceTo (병렬 안전), 접속자 전체 공지는 @serial로 써 두기만 함
const { test, expect, internal } = require('../../helpers/fixtures');
const L = require('./lobbyHelpers');

const bell = (page) => page.getByRole('button', { name: /^알림/ });
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 설정 화면 일반 탭의 알림 체크 끄기 → 로비로
async function turnOffSetting(page, label) {
    await page.goto('/setting');
    const box = page.getByRole('checkbox', { name: label });
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await page.goto('/lobby');
    await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
}

test.describe('알림 창', () => {
    test('새 계정이 로비에 오면 → 알림 버튼에 읽지 않음 1개, 열면 "알림 기능 안내"가 보임', async ({ user }) => {
        const { page } = user;
        await expect(page.getByRole('button', { name: '알림 (읽지 않음 1개)' })).toBeVisible();
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByRole('listitem').filter({ hasText: '알림 기능 안내' })).toBeVisible();
    });

    test('알림 창을 열면 → 보이는 알림이 다 읽음으로 바뀌고 닫으면 배지가 사라짐', async ({ user }) => {
        const { page } = user;
        await expect(page.getByRole('button', { name: '알림 (읽지 않음 1개)' })).toBeVisible();
        const dialog = await L.openNotifications(page);
        await expect(dialog.locator('[data-notification-read="true"]')).toHaveCount(1);
        await dialog.getByRole('button', { name: '닫기' }).click();
        await expect(bell(page)).toHaveAccessibleName('알림');
    });

    test('읽은 뒤 새로 읽어도 → 읽음이 서버에 남아 배지가 다시 안 생김', async ({ user }) => {
        const { page } = user;
        await L.openNotifications(page);
        await page.keyboard.press('Escape');
        await expect(bell(page)).toHaveAccessibleName('알림');
        await page.reload();
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        await expect(bell(page)).toHaveAccessibleName('알림');
    });

    test('읽은 메시지 삭제를 누르면 → 읽은 알림이 지워져 "표시할 알림이 없습니다"', async ({ user }) => {
        const { page } = user;
        const dialog = await L.openNotifications(page);
        const del = dialog.getByRole('button', { name: '읽은 메시지 삭제' });
        await expect(del).toBeEnabled();
        await del.click();
        await expect(dialog.getByText('표시할 알림이 없습니다.')).toBeVisible();
        await expect(del).toBeDisabled();
    });

    test('지운 뒤 새로 읽어도 → 지운 알림은 다시 안 나옴', async ({ user }) => {
        const { page } = user;
        let dialog = await L.openNotifications(page);
        await dialog.getByRole('button', { name: '읽은 메시지 삭제' }).click();
        await expect(dialog.getByText('표시할 알림이 없습니다.')).toBeVisible();
        await page.reload();
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        dialog = await L.openNotifications(page);
        await expect(dialog.getByText('표시할 알림이 없습니다.')).toBeVisible();
    });

    test('알림 창은 → 닫기 버튼·Esc·바깥 누르기로 닫힘', async ({ user }) => {
        const { page } = user;
        let dialog = await L.openNotifications(page);
        await dialog.getByRole('button', { name: '닫기' }).click();
        await expect(dialog).toHaveCount(0);
        dialog = await L.openNotifications(page);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        dialog = await L.openNotifications(page);
        await page.getByRole('button', { name: '알림 닫기' }).click({ position: { x: 10, y: 10 } });
        await expect(dialog).toHaveCount(0);
    });

    test('알림 기능 안내의 환경설정 열기를 누르면 → 설정 화면으로 감', async ({ user }) => {
        const { page } = user;
        const dialog = await L.openNotifications(page);
        await L.clickItemAction(dialog.getByRole('listitem').filter({ hasText: '알림 기능 안내' }), '환경설정 열기');
        await expect(page).toHaveURL(/\/setting$/);
    });

});

test.describe('관리자 공지 알림', () => {
    test('나에게 공지를 보내면 → 로비에 있는 채로 배지가 늘고 창에 제목·본문이 보임', async ({ user }) => {
        const { page, account } = user;
        await expect(page.getByRole('button', { name: '알림 (읽지 않음 1개)' })).toBeVisible();
        const title = `점검 안내 ${uniq()}`;
        await internal.announceTo([account.uuid], { title, body: '오늘 밤 서버 점검이 있습니다.' });
        await expect(page.getByRole('button', { name: '알림 (읽지 않음 2개)' })).toBeVisible({ timeout: 15000 });
        const dialog = await L.openNotifications(page);
        const item = dialog.getByRole('listitem').filter({ hasText: title });
        await expect(item).toContainText('오늘 밤 서버 점검이 있습니다.');
    });

    test('같은 공지 id로 두 번 보내면 → 알림은 하나만 생김', async ({ user }) => {
        const { page, account } = user;
        const id = `e2e-dup-${uniq()}`;
        const payload = { announcementId: id, title: `한 번만 ${id}`, body: '두 번 보내도 하나', target: 'users', userUuids: [account.uuid] };
        await internal.announce(payload);
        const second = await internal.announce(payload);
        expect(second.duplicated ?? second.data?.duplicated).toBe(1);
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByRole('listitem').filter({ hasText: `한 번만 ${id}` })).toHaveCount(1);
    });

    test('다른 사람에게만 보낸 공지는 → 내 알림 창에 안 보임', async ({ user, accounts }) => {
        const { page } = user;
        const other = await accounts.create();
        const title = `남의 공지 ${uniq()}`;
        await internal.announceTo([other.uuid], { title, body: '나에게 안 와야 함' });
        await page.reload();
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByRole('listitem').filter({ hasText: '알림 기능 안내' })).toBeVisible();
        await expect(dialog.getByText(title)).toHaveCount(0);
    });

    test('공지에 스크립트 글을 넣어도 → 글자로만 보이고 실행 안 됨', async ({ user }) => {
        const { page, account } = user;
        let ran = false;
        await page.exposeFunction('__e2eXss', () => { ran = true; });
        const title = `xss ${uniq()}`;
        await internal.announceTo([account.uuid], { title, body: '<img src=x onerror="window.__e2eXss()">본문' });
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByRole('listitem').filter({ hasText: title })).toContainText('<img src=x');
        expect(ran).toBe(false);
    });

    test('접속자 전체 공지를 보내면 → 로비에 있던 내 알림 창에 그 공지가 옴 @serial', async ({ user }) => {
        const { page } = user;
        const id = `e2e-all-${uniq()}`;
        await internal.announce({ announcementId: id, title: `전체 공지 ${id}`, body: '접속자 전체', target: 'online' });
        await expect(page.getByRole('button', { name: /읽지 않음 2개/ })).toBeVisible({ timeout: 15000 });
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByText(`전체 공지 ${id}`)).toBeVisible();
    });
});

test.describe('알림 종류별 숨김 설정', () => {
    test('설정에서 시스템 알림을 끄면 → 안내·공지 알림이 창에서 빠지고 배지도 안 셈', async ({ user }) => {
        const { page, account } = user;
        await turnOffSetting(page, '시스템 알림');
        await internal.announceTo([account.uuid], { title: `숨길 공지 ${uniq()}`, body: '안 보여야 함' });
        await expect(bell(page)).toHaveAccessibleName('알림');
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByText('표시할 알림이 없습니다.')).toBeVisible();
    });

    test('시스템 알림을 다시 켜면 → 숨겼던 안내 알림이 다시 보임', async ({ user }) => {
        const { page } = user;
        await turnOffSetting(page, '시스템 알림');
        await page.goto('/setting');
        await page.getByRole('checkbox', { name: '시스템 알림' }).click();
        await page.goto('/lobby');
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByRole('listitem').filter({ hasText: '알림 기능 안내' })).toBeVisible();
    });

    test('설정에서 친구 초대 알림을 끄면 → 친구 요청 알림은 빠지고 시스템 알림은 그대로', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await turnOffSetting(me.page, '친구 초대');
        await L.sendRequest(other, me);
        const dialog = await L.openNotifications(me.page);
        await expect(dialog.getByRole('listitem').filter({ hasText: '알림 기능 안내' })).toBeVisible();
        await expect(dialog.getByText('새 친구 요청')).toHaveCount(0);
    });

    test('숨긴 알림은 → 창을 열어도 읽음 처리되지 않음 (다시 켜면 안 읽은 채로 셈)', async ({ user }) => {
        const { page } = user;
        await turnOffSetting(page, '시스템 알림');
        const dialog = await L.openNotifications(page);
        await expect(dialog.getByText('표시할 알림이 없습니다.')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.goto('/setting');
        await page.getByRole('checkbox', { name: '시스템 알림' }).click();
        await page.goto('/lobby');
        await expect(page.getByRole('button', { name: '알림 (읽지 않음 1개)' })).toBeVisible();
    });
});
