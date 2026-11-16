'use strict';

// 서로 접속 표시 어려움 브라우저 시험 (PC, 사람 2) — B가 탭을 닫고 다시 오면 A 화면이 "오프라인"·"접속 중"으로 바뀜, A가 새 탭으로 옮겨도 B 화면이 한 번도 "오프라인"이 안 됨
// 목록 A13-친구-알림-초대.md 번호 A13-H-004·005 (H-005는 [지금 동작]), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-presence.hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const K = require('./_a13-kit');

const { U, TEXT } = K;

test('A13-H-004 B 탭 닫음 → A 화면 B "오프라인", B 다시 열기 → A 화면 B "접속 중" @hard @smoke', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    await K.showList(a.page);
    await expect(K.friendRow(a.page, U(b))).toContainText(TEXT.online);

    await b.page.close();
    await expect(K.folderHead(a.page, '오프라인')).toHaveAccessibleName('오프라인 (1)');
    const offline = await K.openFolder(a.page, '오프라인');
    await expect(offline.locator(`li[data-friend-id="${U(b)}"]`)).toContainText(TEXT.offline);

    const again = await b.context.newPage();
    await ui.gotoLobby(again);
    await expect(K.folderOf(a.page, '일반').locator(`li[data-friend-id="${U(b)}"]`)).toContainText(TEXT.online);
});

test('A13-H-005 A가 같은 계정 새 탭으로 옮김 → B 화면의 A 표시가 한 번도 "오프라인"이 안 됨 @hard', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    await K.showList(b.page);
    await expect(K.friendRow(b.page, U(a))).toContainText(TEXT.online);

    // B 화면에서 A 줄이 접속 중 폴더에서 빠지거나 "접속 중"이 아닌 순간을 셈
    await b.page.evaluate((uuid) => {
        window.__a13OfflineSeen = 0;
        const check = () => {
            const row = document.querySelector(`li[data-friend-id="${uuid}"]`);
            if (!row || !row.textContent.includes('접속 중')) window.__a13OfflineSeen += 1;
        };
        new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true });
    }, U(a));

    // 새 탭이 옛 탭을 밀어냄 → 옛 탭 알림 글이 뜰 때까지
    await ui.captureAlert(a.page, async () => {
        const tab = await a.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 15_000 });
    await expect.poll(async () => (await friends.api(b, 'GET', '/friends')).find((f) => f.id === U(a))?.status, { message: '서버가 보는 A 상태' }).toBe('ONLINE');

    await expect(K.friendRow(b.page, U(a))).toContainText(TEXT.online);
    expect(await b.page.evaluate(() => window.__a13OfflineSeen), 'B 화면에서 A가 오프라인으로 보인 순간').toBe(0);
});
