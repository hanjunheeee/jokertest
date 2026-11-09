// 친구 시험: 검색·신청·받은 신청 수락/거절/전부 수락·즐겨찾기·차단/해제·접속 상태 바뀜·패널 닫기
// 두 사람은 players.add로 각자 브라우저, 준비(신청 만들기)는 API로 하고 확인할 동작은 화면으로 누름
const { test, expect } = require('../../helpers/fixtures');
const L = require('./lobbyHelpers');

const searchBox = (panel) => panel.getByRole('searchbox', { name: '친구 검색' });

// 친구 추가 탭에서 닉네임 검색
async function searchUser(page, nickname) {
    const panel = await L.openFriendPanel(page);
    await L.openTab(page, '친구 추가');
    await searchBox(panel).fill(nickname);
    await searchBox(panel).press('Enter');
    return panel;
}

test.describe('친구 찾기·신청', () => {
    test('친구 추가 탭에서 닉네임으로 검색하면 → 그 사람 줄과 접속 상태가 보임', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await searchUser(me.page, other.account.nickname);
        const row = L.friendRow(panel, other.account.nickname);
        await expect(row).toBeVisible();
        await expect(row).toContainText(/접속 중|오프라인|상태 확인 불가/);
    });

    test('없는 닉네임으로 검색하면 → "검색 결과가 없습니다"', async ({ players }) => {
        const me = await players.add();
        const panel = await searchUser(me.page, `zz${Date.now().toString(36)}`);
        await expect(panel.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('검색어를 비우고 Enter를 누르면 → 아무 결과도 안 뜸', async ({ players }) => {
        const me = await players.add();
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '친구 추가');
        await searchBox(panel).press('Enter');
        await expect(panel.getByText('검색 결과가 없습니다.')).toHaveCount(0);
        await expect(panel.getByRole('button', { name: /에게 친구 신청$/ })).toHaveCount(0);
    });

    test('검색 결과에서 친구 신청을 누르면 → 버튼이 "신청 완료"로 바뀜', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await searchUser(me.page, other.account.nickname);
        await panel.getByRole('button', { name: `${other.account.nickname}에게 친구 신청` }).click();
        await expect(panel.getByRole('button', { name: '신청 완료' })).toBeVisible();
    });

    test('신청을 보내면 → 받은 사람 요청 수락 탭에 내 이름 줄이 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await searchUser(me.page, other.account.nickname);
        await panel.getByRole('button', { name: `${other.account.nickname}에게 친구 신청` }).click();
        await expect(panel.getByRole('button', { name: '신청 완료' })).toBeVisible();
        const otherPanel = await L.openFriendPanel(other.page);
        await L.openTab(other.page, '요청 수락');
        await expect(otherPanel.getByRole('button', { name: `${me.account.nickname} 수락` })).toBeVisible();
    });

    test('신청을 받으면 → 받은 사람 알림에 "새 친구 요청"이 오고 요청 보러 가기를 누르면 요청 수락 탭이 열림', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.sendRequest(me, other);
        await expect(other.page.getByRole('button', { name: /^알림 \(읽지 않음/ })).toBeVisible();
        const dialog = await L.openNotifications(other.page);
        const item = dialog.getByRole('listitem').filter({ hasText: '새 친구 요청' });
        await expect(item).toContainText(`${me.account.nickname} 님이 친구 요청을 보냈습니다.`);
        await L.clickItemAction(item, '요청 보러 가기');
        const panel = other.page.getByRole('dialog', { name: '친구 수락' });
        await expect(panel).toBeVisible();
        await expect(panel.locator('[data-notification-target="true"]')).toContainText(me.account.nickname);
    });

    test('이미 친구인 사람에게 다시 신청하면 → 줄 안에 실패 문구', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.makeFriends(me, other);
        const panel = await searchUser(me.page, other.account.nickname);
        const send = panel.getByRole('button', { name: `${other.account.nickname}에게 친구 신청` });
        if (await send.count()) {
            await send.click();
            await expect(panel.getByRole('alert')).toBeVisible();
        } else {
            // 이미 친구면 검색 결과에서 빠지는 방식도 맞음
            await expect(L.friendRow(panel, other.account.nickname)).toHaveCount(0);
        }
    });

    test('내 닉네임으로 검색하면 → 나에게 친구 신청 버튼은 안 보임', async ({ players }) => {
        const me = await players.add();
        const panel = await searchUser(me.page, me.account.nickname);
        await expect(panel.getByRole('button', { name: `${me.account.nickname}에게 친구 신청` })).toHaveCount(0);
    });
});

test.describe('받은 친구 신청', () => {
    test('요청 수락 탭에서 수락을 누르면 → 줄이 사라지고 친구 목록에 그 사람이 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.sendRequest(other, me);
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await panel.getByRole('button', { name: `${other.account.nickname} 수락` }).click();
        await expect(panel.getByRole('button', { name: `${other.account.nickname} 수락` })).toHaveCount(0);
        await panel.getByRole('button', { name: '친구 목록으로 돌아가기' }).click();
        await expect(L.friendRow(me.page.getByRole('dialog', { name: '친구 목록' }), other.account.nickname)).toBeVisible();
    });

    test('수락하면 → 신청한 쪽 친구 목록에도 내가 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.sendRequest(other, me);
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await panel.getByRole('button', { name: `${other.account.nickname} 수락` }).click();
        await expect(panel.getByRole('button', { name: `${other.account.nickname} 수락` })).toHaveCount(0);
        await other.page.reload();
        const otherPanel = await L.openFriendPanel(other.page);
        await expect(L.friendRow(otherPanel, me.account.nickname)).toBeVisible();
    });

    test('거절을 누르면 → 줄이 사라지고 친구 목록에는 안 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.sendRequest(other, me);
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await panel.getByRole('button', { name: `${other.account.nickname} 거절` }).click();
        await expect(panel.getByRole('button', { name: `${other.account.nickname} 거절` })).toHaveCount(0);
        const friends = await L.api(me, 'GET', '/friends');
        expect(JSON.stringify(friends)).not.toContain(other.account.uuid);
    });

    test('신청이 둘일 때 전부 수락을 누르면 → 둘 다 친구가 됨', async ({ players }) => {
        const me = await players.add();
        const a = await players.add();
        const b = await players.add();
        await L.sendRequest(a, me);
        await L.sendRequest(b, me);
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await expect(panel.getByRole('button', { name: `${b.account.nickname} 수락` })).toBeVisible();
        await panel.getByRole('button', { name: '전부 수락' }).click();
        await expect(panel.getByRole('button', { name: `${a.account.nickname} 수락` })).toHaveCount(0);
        await expect(panel.getByRole('button', { name: `${b.account.nickname} 수락` })).toHaveCount(0);
        await expect.poll(async () => {
            const s = JSON.stringify(await L.api(me, 'GET', '/friends'));
            return s.includes(a.account.uuid) && s.includes(b.account.uuid);
        }).toBe(true);
    });

    test('받은 신청이 없으면 → "받은 친구 요청이 없습니다"', async ({ players }) => {
        const me = await players.add();
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await expect(panel.getByText('받은 친구 요청이 없습니다.')).toBeVisible();
    });

    test('요청 검색 칸에 닉네임을 치면 → 맞는 신청 줄만 남음', async ({ players }) => {
        const me = await players.add();
        const a = await players.add();
        const b = await players.add();
        await L.sendRequest(a, me);
        await L.sendRequest(b, me);
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await expect(panel.getByRole('button', { name: `${b.account.nickname} 수락` })).toBeVisible();
        await panel.getByRole('searchbox', { name: '요청 검색' }).fill(a.account.nickname);
        await expect(panel.getByRole('button', { name: `${a.account.nickname} 수락` })).toBeVisible();
        await expect(panel.getByRole('button', { name: `${b.account.nickname} 수락` })).toHaveCount(0);
    });

    test('로비에 있는 동안 신청이 오면 → 새로 읽지 않아도 요청 수락 탭에 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await expect(panel.getByText('받은 친구 요청이 없습니다.')).toBeVisible();
        await L.api(other, 'POST', '/friends/requests', { receiverId: me.account.uuid });
        await expect(panel.getByRole('button', { name: `${other.account.nickname} 수락` })).toBeVisible({ timeout: 15000 });
    });
});

test.describe('친구 목록', () => {
    test('친구 줄의 별을 누르면 → 즐겨찾기 폴더로 옮겨지고 다시 누르면 빠짐', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.makeFriends(me, other);
        await me.page.reload();
        const panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('button', { name: '즐겨찾기 (0)' })).toBeVisible();
        await L.friendRow(panel, other.account.nickname).getByRole('button', { name: '즐겨찾기 추가' }).click();
        const favFolder = panel.getByRole('button', { name: '즐겨찾기 (1)' });
        await expect(favFolder).toBeVisible();
        if ((await favFolder.getAttribute('aria-expanded')) !== 'true') await favFolder.click();
        await panel.getByRole('button', { name: '즐겨찾기 해제' }).first().click();
        await expect(panel.getByRole('button', { name: '즐겨찾기 (0)' })).toBeVisible();
    });

    test('즐겨찾기한 뒤 새로 읽어도 → 즐겨찾기가 남아 있음', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.makeFriends(me, other);
        await me.page.reload();
        let panel = await L.openFriendPanel(me.page);
        await L.friendRow(panel, other.account.nickname).getByRole('button', { name: '즐겨찾기 추가' }).click();
        await expect(panel.getByRole('button', { name: '즐겨찾기 (1)' })).toBeVisible();
        await me.page.reload();
        panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('button', { name: '즐겨찾기 (1)' })).toBeVisible();
    });

    test('접속 중인 친구는 → 일반 폴더에 "접속 중"으로 보이고 수가 1/1', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.makeFriends(me, other);
        await me.page.reload();
        const panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('button', { name: '일반 (1/1)' })).toBeVisible();
        await expect(L.friendRow(panel, other.account.nickname)).toContainText('접속 중');
    });

    test('친구가 브라우저를 닫으면 → 내 목록에서 오프라인으로 바뀜', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.makeFriends(me, other);
        await me.page.reload();
        const panel = await L.openFriendPanel(me.page);
        await expect(L.friendRow(panel, other.account.nickname)).toContainText('접속 중');
        await other.context.close();
        await expect(panel.getByRole('button', { name: '오프라인 (1)' })).toBeVisible({ timeout: 20000 });
    });

    test('오프라인 친구가 들어오면 → 새로 읽지 않아도 접속 중으로 바뀜', async ({ players }) => {
        const me = await players.add();
        const other = await players.add({ lobby: false });
        await L.makeFriends(me, other);
        await me.page.reload();
        const panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('button', { name: '오프라인 (1)' })).toBeVisible();
        await other.page.goto('/lobby');
        await expect(panel.getByRole('button', { name: '일반 (1/1)' })).toBeVisible({ timeout: 20000 });
    });

    test('친구 목록 검색 칸에 닉네임 일부를 치면 → 맞는 친구만 남음', async ({ players }) => {
        const me = await players.add();
        const a = await players.add();
        const b = await players.add();
        await L.makeFriends(me, a);
        await L.makeFriends(me, b);
        await me.page.reload();
        const panel = await L.openFriendPanel(me.page);
        await expect(L.friendRow(panel, b.account.nickname)).toBeVisible();
        await searchBox(panel).fill(a.account.nickname.slice(0, 6));
        await expect(panel.getByRole('list', { name: '친구 검색 결과' })).toContainText(a.account.nickname);
        await expect(panel.getByRole('list', { name: '친구 검색 결과' })).not.toContainText(b.account.nickname);
    });

    test('폴더 머리를 누르면 → 폴더가 접히고 다시 누르면 펼쳐짐', async ({ players }) => {
        const me = await players.add();
        const panel = await L.openFriendPanel(me.page);
        const head = panel.getByRole('button', { name: /^일반 \(/ });
        await expect(head).toHaveAttribute('aria-expanded', 'true');
        await head.click();
        await expect(head).toHaveAttribute('aria-expanded', 'false');
        await head.click();
        await expect(head).toHaveAttribute('aria-expanded', 'true');
    });

    test('친구 패널은 → Esc로 닫히고, 다시 열어 바깥을 누르면 또 닫힘', async ({ players }) => {
        const me = await players.add();
        await L.openFriendPanel(me.page);
        await me.page.keyboard.press('Escape');
        await expect(me.page.getByRole('dialog', { name: '친구 목록' })).toHaveCount(0);
        await L.openFriendPanel(me.page);
        await me.page.getByRole('button', { name: '친구 목록 닫기' }).click({ position: { x: 20, y: 400 } });
        await expect(me.page.getByRole('dialog', { name: '친구 목록' })).toHaveCount(0);
    });

    test('탭을 바꾸면 → 패널 이름도 그 탭 이름으로 바뀜', async ({ players }) => {
        const me = await players.add();
        await L.openFriendPanel(me.page);
        for (const [tab, name] of [['친구 추가', '친구 신청'], ['요청 수락', '친구 수락'], ['게임 초대', '게임 초대'], ['차단 목록', '차단 목록']]) {
            await L.openTab(me.page, tab);
            await expect(me.page.getByRole('dialog', { name })).toBeVisible();
        }
    });
});

test.describe('차단', () => {
    test('검색 결과에서 차단을 누르면 → 차단 목록 탭에 그 사람이 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await searchUser(me.page, other.account.nickname);
        await panel.getByRole('button', { name: `${other.account.nickname} 차단` }).click();
        await L.openTab(me.page, '차단 목록');
        await expect(me.page.getByRole('button', { name: `${other.account.nickname} 차단 해제` })).toBeVisible();
    });

    test('차단 해제를 누르면 → 차단 목록에서 빠짐', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.api(me, 'POST', '/friends/blocks', { targetId: other.account.uuid });
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '차단 목록');
        await panel.getByRole('button', { name: `${other.account.nickname} 차단 해제` }).click();
        await expect(panel.getByText('차단한 사용자가 없습니다.')).toBeVisible();
    });

    test('나를 차단한 사람에게 신청하면 → 줄 안에 실패 문구가 뜨고 신청 안 감', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        await L.api(other, 'POST', '/friends/blocks', { targetId: me.account.uuid });
        const panel = await searchUser(me.page, other.account.nickname);
        const send = panel.getByRole('button', { name: `${other.account.nickname}에게 친구 신청` });
        if (await send.count()) {
            await send.click();
            await expect(panel.getByRole('alert')).toBeVisible();
        } else {
            await expect(L.friendRow(panel, other.account.nickname)).toHaveCount(0);
        }
        const incoming = await L.api(other, 'GET', '/friends/requests/incoming');
        expect(incoming.length).toBe(0);
    });
});
