'use strict';

// 남의 사이트(목록 밖 주소) 브라우저 시험 (PC) — 로그인한 브라우저로 남의 페이지를 열어도 내 정보 읽기·닉네임 바꾸기·폼 친구 신청·폼 구매·소켓 열기가 안 됨, 허용 화면 주소에선 됨
// 목록 A15-보안.md 번호 A15-E-031~036 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-cross-site.spec.js)
// 남의 페이지는 이 시험이 127.0.0.1 높은 포트에 띄움 (화면 주소 localhost와 다른 사이트, 바깥 주소로는 아무것도 안 보냄)
const { test, expect, E2E } = require('../../helpers/fixtures');
const { api, login, sec, db } = require('./_sec');
const st = require('../store/store-tools');
const k = require('./_a15-kit');

// 남의 페이지 스크립트: 결과를 window.__a15에 적음 (done·status·body·error)
const fetchPage = (init) => `<!doctype html><meta charset="utf-8"><title>남의 사이트</title><p id="out">기다림</p>
<script>
window.__a15 = { done: false };
fetch(${JSON.stringify(`${E2E.apiUrl}`)} + ${JSON.stringify(init.path)}, ${JSON.stringify({ credentials: 'include', ...init.options })})
  .then(async (r) => { window.__a15 = { done: true, status: r.status, body: await r.text() }; document.getElementById('out').textContent = window.__a15.body; })
  .catch((e) => { window.__a15 = { done: true, error: String(e) }; document.getElementById('out').textContent = '가져오기 실패'; });
</script>`;

// 남의 페이지 폼: 열자마자 우리 API로 POST (폼 본문, 사람이 모르게 보내는 꼴)
const formPage = (pathname, fields) => `<!doctype html><meta charset="utf-8"><title>남의 사이트</title>
<form id="f" method="POST" action="${E2E.apiUrl}${pathname}" enctype="application/x-www-form-urlencoded">
${Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${name}" value="${value}">`).join('\n')}
</form><script>document.getElementById('f').submit();</script>`;

// 남의 페이지 열고 스크립트가 끝날 때까지 → window.__a15
async function runOutside(page, html) {
    const site = await k.startOutsideSite({ '/': html });
    try {
        await page.goto(site.url('/'));
        await expect.poll(() => page.evaluate(() => window.__a15?.done === true), { timeout: 15_000 }).toBe(true);
        return { result: await page.evaluate(() => window.__a15), text: await page.locator('body').innerText() };
    } finally {
        await site.close();
    }
}

// 남의 페이지 폼 보내고 그 답 화면(우리 API 주소)까지
async function submitOutsideForm(page, pathname, fields) {
    const site = await k.startOutsideSite({ '/': formPage(pathname, fields) });
    try {
        const answered = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}${pathname}` && r.request().method() === 'POST');
        await page.goto(site.url('/'));
        return (await answered).status();
    } finally {
        await site.close();
    }
}

test('A15-E-031 로그인한 브라우저, 남의 페이지가 쿠키 실어 GET /auth/me → 응답을 못 읽음, 페이지에 내 정보 없음 @smoke', async ({ user }) => {
    const { page, account } = user;
    const { result, text } = await runOutside(page, fetchPage({ path: '/auth/me', options: { method: 'GET' } }));
    expect(result.error, `가져오기가 실패해야 함 (받은 상태 ${result.status})`).toBeTruthy();
    expect(result.body).toBeUndefined();
    for (const secret of [account.uuid, account.email, account.nickname]) expect(text).not.toContain(secret);
});

test('A15-E-032 남의 페이지가 PATCH /user/me/nickname → 미리 묻기 거절, 닉네임 그대로', async ({ user }) => {
    const { page, account } = user;
    const site = await k.startOutsideSite({ '/': '' });
    const outsideOrigin = site.origin;
    await site.close();
    // 서버가 남의 주소 미리 묻기에 허용 머리말을 안 붙임
    const preflight = await api('OPTIONS', '/user/me/nickname', {
        headers: { origin: outsideOrigin, 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'content-type' },
    });
    expect(preflight.headers['access-control-allow-origin'] ?? null).toBeNull();
    const { result } = await runOutside(page, fetchPage({
        path: '/user/me/nickname',
        options: { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'a15바꿈' }) },
    }));
    expect(result.error, `가져오기가 실패해야 함 (받은 상태 ${result.status})`).toBeTruthy();
    const [row] = await db.query('SELECT nickname FROM users WHERE uuid = ?', [account.uuid]);
    expect(row.nickname).toBe(account.nickname);
});

test('A15-E-033 허용 화면 주소(PC 화면)에서 같은 GET /auth/me → 200, 내 계정', async ({ user }) => {
    const { page, account } = user;
    await expect(page).toHaveURL(new RegExp(`^${E2E.desktopUrl}`));
    const got = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'include' });
        return { status: r.status, body: await r.json() };
    }, `${E2E.apiUrl}/auth/me`);
    expect(got.status).toBe(200);
    // /auth/me 답은 uuid·role뿐 (목록의 "내 닉네임"은 이 답에 없음 → 보고)
    expect(got.body?.data?.uuid).toBe(account.uuid);
});

test('A15-E-034 남의 페이지 폼이 POST /friends/requests(폼 본문) → 쿠키 안 실림, 친구 신청 안 생김', async ({ user, accounts }) => {
    const target = await accounts.create();
    const status = await submitOutsideForm(user.page, '/friends/requests', { receiverId: target.uuid });
    expect(status, '로그인 안 된 요청으로 받음').toBe(401);
    const { cookie } = await login(target);
    const incoming = await api('GET', '/friends/requests/incoming', { cookie });
    expect(incoming.status).toBe(200);
    const rows = incoming.json?.data ?? [];
    expect(rows.filter((r) => r.id === user.account.uuid)).toEqual([]);
});

test('A15-E-035 남의 페이지 폼이 POST /economy/purchase → 지갑·소유품 그대로', async ({ user }) => {
    const uuid = user.account.uuid;
    // 쿠키가 실렸다면 살 수 있게 골드를 넣어 둠
    await st.grant(uuid, 'GOLD', 1000);
    const walletBefore = await st.wallet(uuid);
    const ownedBefore = (await st.owned(uuid)).sort();
    const status = await submitOutsideForm(user.page, '/economy/purchase', {
        itemId: 'profile-border-남작', referenceEventId: `a15-cross-${Date.now()}`,
    });
    expect(status, '로그인 안 된 요청으로 받음').toBe(401);
    expect(await st.wallet(uuid)).toEqual(walletBefore);
    expect((await st.owned(uuid)).sort()).toEqual(ownedBefore);
});

test('A15-E-036 목록 밖 Origin + 로그인 쿠키로 소켓 열기 → 연결 안 됨', async ({ accounts }) => {
    const { cookie } = await login(await accounts.create());
    const site = await k.startOutsideSite({ '/': '' });
    const origin = site.origin;
    await site.close();
    const s = await sec.openRawSocket({ cookie, origin });
    try {
        expect(s.connected).toBe(false);
        expect(s.error).toBeTruthy();
    } finally {
        s.close();
    }
});
