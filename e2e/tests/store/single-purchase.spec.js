// 아이템 한 개 사기(POST /economy/purchase)·구매 결과 다시 묻기(GET /economy/purchases/:id): 골드 빠짐·보유·장부 한 줄, 같은 요청 두 번이면 한 번만, 모자람 거절
// 한 개 사기 길은 지금 화면이 안 써서(가게는 묶음 길) 로그인된 브라우저 쿠키로 바로 보내고 상점 화면 표시로 확인, 응답 끊긴 묶음 구매는 새로 고침 뒤 다시 묻기로 맞춤
const { test, expect, E2E } = require('../../helpers/fixtures');
const st = require('./store-tools');

const ITEM = 'profile-border-남작';
const PRICE = 200;

/** 로그인된 브라우저 쿠키로 서버에 바로 보내기 → { status, body } */
async function send(context, method, path, data) {
    const res = await context.request.fetch(`${E2E.apiUrl}${path}`, { method, data, headers: { origin: E2E.desktopUrl } });
    return { status: res.status(), body: await res.json() };
}

const buy = (context, referenceEventId, itemId = ITEM) => send(context, 'POST', '/economy/purchase', { itemId, referenceEventId });
const lookup = (context, referenceEventId) => send(context, 'GET', `/economy/purchases/${encodeURIComponent(referenceEventId)}`);
const purchaseRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'PURCHASE');

test.describe('아이템 한 개 사기', () => {
    test('골드 1000으로 남작 테두리를 사면 → 201·장부 -200, 골드 800·보유, 상점 화면에도 보유중·800', async ({ user, context }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        const ref = `e2e-single:${st.rand(6)}`;
        const res = await buy(context, ref);
        expect(res.status).toBe(201);
        expect(res.body.idempotent).toBe(false);
        expect(res.body.ledgerEntry).toMatchObject({ reason: 'PURCHASE', itemId: ITEM, currency: 'GOLD', amount: -PRICE, balanceAfter: 800 });
        expect(await st.wallet(account.uuid)).toEqual({ gold: 800, diamond: 0 });
        expect(await st.owned(account.uuid)).toContain(ITEM);
        expect(await purchaseRows(account.uuid)).toHaveLength(1);

        await st.gotoStore(page);
        await expect(st.balance(page, '골드', 800)).toBeVisible();
        await st.pickCategory(page, '프로필 테두리');
        await st.pickItem(page, '남작 200');
        await expect(st.detail(page).getByRole('button', { name: '보유중' })).toBeDisabled();
    });

    test('같은 구매 요청(같은 참조 id)을 두 번 보내면 → 두 번째는 200·처음 결과 그대로, 골드는 한 번만 빠짐', async ({ user, context }) => {
        const { account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        const ref = `e2e-single:${st.rand(6)}`;
        const first = await buy(context, ref);
        const second = await buy(context, ref);
        expect(first.status).toBe(201);
        expect(second.status).toBe(200);
        expect(second.body.idempotent).toBe(true);
        expect(second.body.ledgerEntry.id).toBe(first.body.ledgerEntry.id);
        expect(second.body.ledgerEntry.balanceAfter).toBe(800);
        expect((await st.wallet(account.uuid)).gold).toBe(800);
        expect(await purchaseRows(account.uuid)).toHaveLength(1);
    });

    test('같은 참조 id로 다른 아이템을 사려 하면 → 409 REFERENCE_EVENT_CONFLICT, 골드 그대로', async ({ user, context }) => {
        const { account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        const ref = `e2e-single:${st.rand(6)}`;
        expect((await buy(context, ref)).status).toBe(201);
        const other = await buy(context, ref, 'profile-border-자작');
        expect(other.status).toBe(409);
        expect(other.body.code).toBe('REFERENCE_EVENT_CONFLICT');
        expect((await st.wallet(account.uuid)).gold).toBe(800);
        expect(await st.owned(account.uuid)).not.toContain('profile-border-자작');
    });

    test('골드가 모자라면 → 400 INSUFFICIENT_BALANCE, 골드·보유·장부 그대로, 결과 묻기도 없음 404', async ({ user, context }) => {
        const { account } = user;
        await st.grant(account.uuid, 'GOLD', 100);
        const ref = `e2e-single:${st.rand(6)}`;
        const res = await buy(context, ref);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
        expect((await st.wallet(account.uuid)).gold).toBe(100);
        expect(await st.owned(account.uuid)).not.toContain(ITEM);
        expect(await purchaseRows(account.uuid)).toHaveLength(0);
        const missing = await lookup(context, ref);
        expect(missing.status).toBe(404);
        expect(missing.body.code).toBe('PURCHASE_RESULT_NOT_FOUND');
    });
});

test.describe('구매 결과 다시 묻기', () => {
    test('한 개 산 뒤 참조 id로 물으면 → 한 개 구매(SINGLE)와 장부 줄이 그대로 옴', async ({ user, context }) => {
        const { account } = user;
        await st.grant(account.uuid, 'GOLD', 500);
        const ref = `e2e-single:${st.rand(6)}`;
        const bought = await buy(context, ref);
        const res = await lookup(context, ref);
        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('SINGLE');
        expect(res.body.results).toHaveLength(1);
        expect(res.body.results[0]).toMatchObject({ id: bought.body.ledgerEntry.id, itemId: ITEM, amount: -PRICE, balanceAfter: 300 });
    });

    test('가게에서 사다가 응답이 끊기면 → 확인 필요 안내, 새로 고치면 결과를 다시 물어 완료·잔액 맞음, 두 번 안 삼', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 800);
        await st.gotoStore(page);
        await st.pickCategory(page, '프로필 테두리');
        await st.pickItem(page, '남작 200');

        // 서버는 처리하고 브라우저만 응답을 못 받게 끊음
        await page.route('**/economy/purchases/bulk', async (route) => {
            await route.fetch();
            await route.abort('failed');
        });
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매 결과 확인이 필요합니다.')).toBeVisible();
        await expect.poll(async () => (await st.wallet(account.uuid)).gold).toBe(600);
        await page.unroute('**/economy/purchases/bulk');

        // 새로 고침: 남은 기록으로 같은 참조 id 결과를 물음 (새 구매는 안 보냄)
        const posts = [];
        page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/economy/purchases')) posts.push(r.url()); });
        const asked = page.waitForResponse((r) => r.request().method() === 'GET' && /\/economy\/purchases\/shop%3A|\/economy\/purchases\/shop:/.test(r.url()));
        await st.gotoStore(page);
        const res = await asked;
        expect(res.status()).toBe(200);
        expect((await res.json()).results[0]).toMatchObject({ itemId: ITEM, balanceAfter: 600 });
        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
        await expect(st.balance(page, '골드', 600)).toBeVisible();
        await st.pickCategory(page, '프로필 테두리');
        await st.pickItem(page, '남작 200');
        await expect(st.detail(page).getByRole('button', { name: '보유중' })).toBeDisabled();

        expect(posts).toEqual([]);
        expect((await st.wallet(account.uuid)).gold).toBe(600);
        expect(await purchaseRows(account.uuid)).toHaveLength(1);
    });
});
