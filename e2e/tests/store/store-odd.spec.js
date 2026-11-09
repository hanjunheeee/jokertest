// 상점 이상한 순서·동시 화면 시험 파일, 버튼 따닥·같은 계정 창 둘·옛 화면에서 사기
// 보는 것: 서버로 가는 요청 수, 돈은 한 번만 빠짐, 진 창은 알맞은 안내 (돈은 서버 쪽 시험 store-odd-*.integration이 더 깊게 봄)
const { test, expect } = require('../../helpers/fixtures');
const st = require('./store-tools');

// 그 길로 간 POST 요청 수 세기 (페이지마다)
function countPosts(page, pattern) {
    const counter = { n: 0 };
    page.on('request', (r) => { if (r.method() === 'POST' && pattern.test(r.url())) counter.n += 1; });
    return counter;
}

// 가게 구매는 묶음 길(/purchases/bulk), 한 개 길(/purchase)도 같이 셈
const ITEM_PURCHASE = /\/economy\/(purchases\/bulk|purchase)(\?|$)/;
const GOLD_PURCHASE = /\/economy\/gold-purchases(\?|$)/;
const COUPON_REDEEM = /\/coupons\/redeem(\?|$)/;

// 쿠폰 창 열고 코드 넣기 → 창
async function openCouponWith(page, code) {
    await page.getByRole('button', { name: '쿠폰 입력' }).click();
    const dialog = page.getByRole('dialog', { name: '쿠폰 입력' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    return dialog;
}

test.describe('상점 이상한 순서·동시', () => {
    test('스킨 구매 버튼을 따닥 누르면 → 서버엔 한 번만 가고, 완료 안내·골드 500 한 번만 빠짐', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        await st.gotoStore(page);
        await st.pickItem(page, '귀족 블러드 500');
        const posts = countPosts(page, ITEM_PURCHASE);

        await st.detail(page).getByRole('button', { name: '구매' }).dblclick();

        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
        await expect(st.balance(page, '골드', 500)).toBeVisible();
        expect(posts.n).toBe(1);
        expect((await st.wallet(account.uuid)).gold).toBe(500);
        expect((await st.ledger(account.uuid)).filter((r) => r.reason === 'PURCHASE')).toHaveLength(1);
    });

    test('금화 사기 버튼을 따닥 누르면 → 서버엔 한 번만 가고 다이아 10·골드 100 한 번만 (금화는 보유로 안 막혀서 따닥이 그대로 두 번 사질 수 있는 곳)', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'DIAMOND', 25);
        await st.gotoStore(page);
        await st.pickCategory(page, '인게임 재화');
        await st.pickItem(page, '금화 100개 10');
        const posts = countPosts(page, GOLD_PURCHASE);

        await st.detail(page).getByRole('button').last().dblclick();

        await expect(page.getByTestId('gold-feedback')).toContainText('골드 구매가 완료되었습니다.');
        await expect(st.balance(page, '다이아', 15)).toBeVisible();
        expect(posts.n).toBe(1);
        expect(await st.wallet(account.uuid)).toEqual({ gold: 100, diamond: 15 });
        expect((await st.ledger(account.uuid)).filter((r) => r.reason === 'GOLD_PURCHASE')).toHaveLength(2);
    });

    test('쿠폰 사용하기를 따닥 누르면 → 서버엔 한 번만 가고 받았다는 안내만, "이미 사용" 안내는 안 뜸', async ({ user }) => {
        const { page, account } = user;
        const code = await st.createCoupon({ rewardType: 'GOLD', amount: 300 });
        await st.gotoStore(page);
        const dialog = await openCouponWith(page, code);
        const posts = countPosts(page, COUPON_REDEEM);

        await dialog.getByRole('button', { name: '사용하기' }).dblclick();

        await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
        await expect(dialog.getByRole('alert')).toHaveCount(0);
        expect(posts.n).toBe(1);
        expect((await st.wallet(account.uuid)).gold).toBe(300);
        expect(await st.couponUsedCount(code)).toBe(1);
    });

    test('같은 계정 창 둘에서 같은 스킨을 같은 순간에 사면 → 골드는 한 번만, 적어도 한 창은 완료 안내, 새로 고치면 두 창 다 보유중', async ({ user }) => {
        const { page, account, context } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        const other = await context.newPage();
        for (const p of [page, other]) {
            await st.gotoStore(p);
            await st.pickItem(p, '귀족 블러드 500');
        }

        await Promise.all([page, other].map((p) => st.detail(p).getByRole('button', { name: '구매' }).click()));

        await expect.poll(async () => (await st.ledger(account.uuid)).filter((r) => r.reason === 'PURCHASE').length).toBe(1);
        // 창마다 따로 봄 (다른 창 위치끼리는 or로 못 묶음)
        const doneCount = async () => (await page.getByText('구매가 완료되었습니다.').count()) + (await other.getByText('구매가 완료되었습니다.').count());
        await expect.poll(doneCount).toBeGreaterThan(0);
        expect((await st.wallet(account.uuid)).gold).toBe(500);
        for (const p of [page, other]) {
            await st.gotoStore(p);
            await st.pickItem(p, '귀족 블러드 500');
            await expect(st.detail(p).getByRole('button', { name: '보유중' })).toBeDisabled();
            await expect(st.balance(p, '골드', 500)).toBeVisible();
        }
    });

    test('한 창에서 산 뒤 새로 안 고친 다른 창(옛 화면)에서 같은 스킨을 사면 → 거부 안내, 골드는 더 안 빠짐', async ({ user }) => {
        const { page, account, context } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        const stale = await context.newPage();
        await st.gotoStore(stale);
        await st.pickItem(stale, '귀족 블러드 500');

        await st.gotoStore(page);
        await st.pickItem(page, '귀족 블러드 500');
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();

        await st.detail(stale).getByRole('button', { name: '구매' }).click();
        await expect(stale.getByText('구매가 거부되었습니다. 재화는 차감되지 않았습니다.')).toBeVisible();
        expect((await st.wallet(account.uuid)).gold).toBe(500);
        expect((await st.ledger(account.uuid)).filter((r) => r.reason === 'PURCHASE')).toHaveLength(1);
    });

    test('같은 계정 창 둘에서 같은 쿠폰을 같은 순간에 쓰면 → 한 창은 받았다는 안내, 다른 창은 "이미 사용한 쿠폰입니다.", 골드 한 번만', async ({ user }) => {
        const { page, account, context } = user;
        const code = await st.createCoupon({ rewardType: 'GOLD', amount: 300 });
        const other = await context.newPage();
        const dialogs = [];
        for (const p of [page, other]) {
            await st.gotoStore(p);
            dialogs.push(await openCouponWith(p, code));
        }

        await Promise.all(dialogs.map((d) => d.getByRole('button', { name: '사용하기' }).click()));

        const shown = await Promise.all(dialogs.map(async (d) => {
            await expect(d.getByRole('status').or(d.getByRole('alert')).first()).toBeVisible();
            return (await d.getByRole('status').count()) > 0 && (await d.getByRole('status').innerText()).includes('받았습니다') ? 'ok' : (await d.getByRole('alert').innerText());
        }));
        expect(shown.sort()).toEqual(['ok', '이미 사용한 쿠폰입니다.'].sort());
        expect((await st.wallet(account.uuid)).gold).toBe(300);
        expect(await st.couponUsedCount(code)).toBe(1);
    });
});
