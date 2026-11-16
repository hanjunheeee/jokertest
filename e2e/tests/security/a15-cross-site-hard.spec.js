'use strict';

// 남의 사이트가 몰래 세 가지 어려움 브라우저 시험 (PC, 사람 1 + 남의 페이지 1) — 로그인한 브라우저에서 남의 페이지가 폼 친구 신청·폼 구매·소켓 방 만들기를 한꺼번에 → 셋 다 안 됨, 진짜 화면은 로그인 그대로·방 없음
// 목록 A15-보안.md 번호 A15-H-007 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-cross-site-hard.spec.js)
const { test, expect, E2E, ui, e2e } = require('../../helpers/fixtures');
const { api, login } = require('./_sec');
const st = require('../store/store-tools');
const k = require('./_a15-kit');

// 남의 페이지: 숨은 틀(iframe) 둘에 폼 두 개를 보내고, 우리 소켓 주소로 웹소켓을 직접 열어 방 만들기를 보냄 → 결과는 window.__a15
function evilPage({ receiverId }) {
    const wsUrl = `${E2E.apiUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
    const createRoom = JSON.stringify(['create_room', { accessType: 'code', maxPlayers: 5, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 }]);
    return `<!doctype html><meta charset="utf-8"><title>남의 사이트</title>
<iframe name="sink1" title="틀1"></iframe><iframe name="sink2" title="틀2"></iframe>
<form id="f1" target="sink1" method="POST" action="${E2E.apiUrl}/friends/requests"><input type="hidden" name="receiverId" value="${receiverId}"></form>
<form id="f2" target="sink2" method="POST" action="${E2E.apiUrl}/economy/purchase">
<input type="hidden" name="itemId" value="profile-border-남작"><input type="hidden" name="referenceEventId" value="a15-hard-${Date.now()}"></form>
<script>
window.__a15 = { connected: false, done: false };
document.getElementById('f1').submit();
document.getElementById('f2').submit();
const ws = new WebSocket(${JSON.stringify(wsUrl)});
const finish = (why) => { window.__a15.done = true; window.__a15.why = why; };
ws.onmessage = (e) => {
  const d = String(e.data);
  if (d === '2') { ws.send('3'); return; }
  if (d.startsWith('0')) { ws.send('40'); return; }
  if (d.startsWith('40')) { window.__a15.connected = true; ws.send('420' + ${JSON.stringify(createRoom)}); return; }
  if (d.startsWith('44')) { finish('거절 ' + d.slice(0, 80)); return; }
  if (d.startsWith('430')) { window.__a15.reply = d; finish('방 만들기 답'); }
};
ws.onclose = () => finish('닫힘');
ws.onerror = () => finish('오류');
setTimeout(() => finish('시간 끝'), 8000);
</script>`;
}

test('A15-H-007 남의 페이지가 폼 친구 신청·폼 구매·소켓 방 만들기 → 셋 다 안 됨, 진짜 화면은 로그인 그대로·방 없음 @hard @smoke', async ({ user, accounts }) => {
    const target = await accounts.create();
    const uuid = user.account.uuid;
    await st.grant(uuid, 'GOLD', 1000);
    const walletBefore = await st.wallet(uuid);
    const ownedBefore = (await st.owned(uuid)).sort();
    const site = await k.startOutsideSite({ '/': evilPage({ receiverId: target.uuid }) });
    const evil = await user.context.newPage();
    try {
        const posts = [];
        evil.on('response', (res) => {
            const url = res.url();
            if (res.request().method() === 'POST' && (url.endsWith('/friends/requests') || url.endsWith('/economy/purchase'))) posts.push({ url, status: res.status() });
        });
        await evil.goto(site.url('/'));
        await expect.poll(() => evil.evaluate(() => window.__a15?.done === true), { timeout: 15_000 }).toBe(true);
        await expect.poll(() => posts.length, { timeout: 10_000, message: '폼 두 개가 보내짐' }).toBe(2);
        // 폼: 쿠키가 안 실려 로그인 안 된 요청
        for (const p of posts) expect(p.status, p.url).toBe(401);
        // 소켓: 연결 안 됨 → 방 만들기 답 없음
        const result = await evil.evaluate(() => window.__a15);
        expect(result.connected, `소켓 결과: ${result.why}`).toBe(false);
        expect(result.reply).toBeUndefined();
    } finally {
        await evil.close().catch(() => {});
        await site.close();
    }
    // 친구 신청 안 생김
    const { cookie } = await login(target);
    const incoming = await api('GET', '/friends/requests/incoming', { cookie });
    expect((incoming.json?.data ?? []).filter((r) => r.id === uuid)).toEqual([]);
    // 지갑·소유품 그대로, 방 없음
    expect(await st.wallet(uuid)).toEqual(walletBefore);
    expect((await st.owned(uuid)).sort()).toEqual(ownedBefore);
    expect(await e2e.roomOf(uuid)).toBeNull();
    // 진짜 화면은 로그인 그대로
    await ui.gotoLobby(user.page);
    await expect(user.page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
});
