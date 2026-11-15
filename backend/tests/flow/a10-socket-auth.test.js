'use strict';

// 소켓 연결 검사 시험 — 접속 거절(까닭 안 드러남), 접속 중 정지면 다음 사건 거절·끊김, 사건 없어도 5초 주기 검사로 끊김
// 목록 A10-B-224~230 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-socket-auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { makeWorld, START_MS } = require('./a10-world');
const { authenticateSocket } = require('../../socket/connection/auth');
const { notifySessionsRevoked } = require('../../repositories/user/revokeSignal');

// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a10-socket-auth-test-only';

// 로그인 때 주는 것과 같은 모양 토큰 (uuid·세션 id, 15분)
const signToken = (uuid, { secret = process.env.JWT_SECRET, expiresIn = 900, iat = Math.floor(START_MS / 1000) } = {}) =>
    jwt.sign({ uuid, sessionId: `sess-${uuid}`, iat }, secret, { algorithm: 'HS256', expiresIn });

// 접속 인증 한 번 → next에 넘긴 값 (통과 = undefined), 소켓도 같이
function handshake(cookieHeader) {
    const socket = { data: {}, handshake: { headers: cookieHeader ? { cookie: cookieHeader } : {} } };
    return new Promise((resolve) => authenticateSocket(socket, (err) => resolve({ err, socket })));
}

const REJECTS = [
    ['A10-B-224', '쿠키 없음', () => null, null],
    ['A10-B-225', '토큰 서명 틀림', (u) => `accessToken=${signToken(u, { secret: 'not-the-server-secret' })}`, null],
    ['A10-B-226', '토큰 만료', (u) => `accessToken=${signToken(u, { iat: Math.floor(START_MS / 1000) - 3_600, expiresIn: 60 })}`, null],
    ['A10-B-227', '세션 끝남', (u) => `accessToken=${signToken(u)}`, 'gone'],
    ['A10-B-228', '정지 계정', (u) => `accessToken=${signToken(u)}`, 'banned'],
];
for (const [id, label, cookieOf, state] of REJECTS) {
    test(`${id} 소켓 접속 (${label}) → 접속 오류 UNAUTHORIZED, 까닭 안 드러남`, async (t) => {
        const w = makeWorld(t);
        const uuid = `${id}-u`;
        if (state) w.sessionStates.set(uuid, state);
        const { err, socket } = await handshake(cookieOf(uuid));
        assert.ok(err instanceof Error, '접속이 통과됨');
        assert.equal(err.message, 'UNAUTHORIZED');
        assert.equal(err.data, undefined, '오류에 까닭이 실림');
        assert.equal(socket.data.user, undefined, '거절됐는데 사용자 정보가 붙음');
    });
}

test('A10-B-229 접속 뒤 세션 검사가 정지로 바뀜 → 다음 enter_lobby 답 SESSION_EXPIRED + force_disconnect ACCOUNT_BANNED + 끊김, 정리 안 일어남', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b229', n: 5 });
    const guest = r.guests[1];
    const socket = w.sock(guest);
    w.sessionStates.set(guest, 'banned');
    // 관리자 정지 = 그 사람 세션 끊김 알림 (사건 검사 저장 결과를 안 믿게 됨)
    notifySessionsRevoked(guest);
    const reply = await w.lobby(socket);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SESSION_EXPIRED');
    assert.equal(w.received(socket, 'force_disconnect').at(-1)?.code, 'ACCOUNT_BANNED');
    assert.equal(socket.connected, false);
    assert.equal(w.received(r.host, 'player_left_room').filter((p) => p.uuid === guest).length, 0, '로비 정리가 일어남');
    assert.equal((await w.currentRoom(r.host)).players.length, 5);
});

test('A10-B-230 접속 뒤 세션 끝남 → 가짜 시계 5초 → force_disconnect SESSION_EXPIRED + 끊김', async (t) => {
    const w = makeWorld(t);
    const socket = await w.connect('b230-a');
    w.sessionStates.set('b230-a', 'gone');
    await w.tick(4_999);
    assert.equal(socket.connected, true, '5초 전에 끊김');
    await w.tick(1);
    assert.equal(w.received(socket, 'force_disconnect').at(-1)?.code, 'SESSION_EXPIRED');
    assert.equal(socket.connected, false);
});
