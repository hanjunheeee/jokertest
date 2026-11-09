// 관리자 열린 방 (Node 둘, AD-253): Node마다 방 하나 → 관리자 열린 방 목록에 둘 다 + 서버 칸이 각 Node
// 관리자 요청은 아무 Node로 가도 RPC로 전 Node 것을 합치는지 봄 (E2E_NODES=2 이상에서만 돎)
const mn = require('./_mn');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

const { test, expect, E2E, NODE_IDS } = mn;

test('AD-253 Node 둘 방 둘 → 관리자 목록에 둘 다, 서버 칸이 각 Node', async ({ bots, browser }) => {
    const rooms = [];
    for (const node of NODE_IDS.slice(0, 2)) {
        const [host] = await mn.botsOn(bots, 1, node);
        rooms.push({ node, room: await host.createRoom({}) });
    }

    const adminContext = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    try {
        const page = await adminContext.newPage();
        await loginAsAdmin(page, await createAdmin());
        await page.goto('/live');
        const table = page.getByRole('table', { name: '대기방' });
        for (const { node, room } of rooms) {
            const row = table.getByRole('row').filter({ hasText: room.roomCode });
            await expect(row).toHaveCount(1);
            await expect(row.getByRole('cell').last()).toHaveText(node);
        }
        // 서버별 표에 두 Node 다 "받음"
        const nodesTable = page.getByRole('table', { name: '서버별 숫자' });
        for (const node of NODE_IDS.slice(0, 2)) {
            await expect(nodesTable.getByRole('row').filter({ hasText: node })).toContainText('받음');
        }
        await expect(page.getByText(/못 받음 —/)).toHaveCount(0);
    } finally {
        await adminContext.close();
    }
});
