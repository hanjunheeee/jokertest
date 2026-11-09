'use strict';

// 친구 맺기 파일, 사람·봇 쿠키로 API 부르기 + 친구 신청·수락을 API로 빨리 만들기
// tests/lobby·tests/room 시험이 씀 (화면으로 볼 부분만 시험에서 누르고, 준비는 여기 API로)
const { E2E } = require('./env');

const headers = { origin: E2E.desktopUrl };

// 그 사람 브라우저 쿠키로 API 부르기 → data
async function api(person, method, pathname, data) {
    const res = await person.context.request.fetch(`${E2E.apiUrl}${pathname}`, { method, data, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok()) throw new Error(`${method} ${pathname} → ${res.status()} ${body?.message ?? ''}`);
    return body.data;
}

// 봇(소켓 봇)의 쿠키로 API 부르기
async function botApi(bot, method, pathname, data) {
    const res = await fetch(`${E2E.apiUrl}${pathname}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: bot.cookie, origin: E2E.desktopUrl },
        body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`봇 ${method} ${pathname} → ${res.status} ${body?.message ?? ''}`);
    return body.data;
}

// from → to 친구 신청, to가 받은 신청 id 돌려줌
async function sendRequest(from, to) {
    await api(from, 'POST', '/friends/requests', { receiverId: to.account.uuid });
    const incoming = await api(to, 'GET', '/friends/requests/incoming');
    const row = incoming.find((r) => r.id === from.account.uuid);
    if (!row) throw new Error('받은 신청 없음');
    return row.request_id;
}

// a가 신청 → b가 수락 (둘 다 context 로그인됨), 신청 id 돌려줌
async function makeFriends(a, b) {
    const requestId = await sendRequest(a, b);
    await api(b, 'PUT', `/friends/requests/${requestId}/accept`);
    return requestId;
}

module.exports = { api, botApi, sendRequest, makeFriends };
