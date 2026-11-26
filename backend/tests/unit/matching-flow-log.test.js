'use strict';

// 매칭 흐름 디버그 기록(matchingFlowLog · debug_matching_flow · create_room_ack) 시험
// DEBUG_MATCHING_FLOW=1 조건·줄바꿈 치환·크기 제한·소켓 uuid 고정·방 코드 평문 미노출 확인
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const test = require('node:test');
const assert = require('node:assert/strict');

const { logMatchingFlow } = require('../../socket/matchmaking/debug/matchingFlowLog');
const { makeWorld } = require('../flow/a08-world');

// console.log 가로채기 + DEBUG_MATCHING_FLOW 환경값 되돌리기
function captureLogs(t, debugValue) {
    const prevDebug = process.env.DEBUG_MATCHING_FLOW;
    if (debugValue === undefined) delete process.env.DEBUG_MATCHING_FLOW;
    else process.env.DEBUG_MATCHING_FLOW = debugValue;

    const captured = [];
    t.mock.method(console, 'log', (...args) => { captured.push(args); });
    t.after(() => {
        if (prevDebug === undefined) delete process.env.DEBUG_MATCHING_FLOW;
        else process.env.DEBUG_MATCHING_FLOW = prevDebug;
    });
    return captured;
}

test('DEBUG_MATCHING_FLOW가 1이 아니면 개발 환경(NODE_ENV=development)이어도 찍지 않음', (t) => {
    const captured = captureLogs(t, undefined);
    logMatchingFlow('step_check', { uuid: 'u-1' });
    const world = makeWorld(t);
    const s = world.connect('u-dev');
    s.trigger('debug_matching_flow', { step: 'from_client', uuid: 'spoofed' });
    assert.equal(captured.filter(([tag]) => String(tag).startsWith('[MMC-FLOW]')).length, 0);
});

test('DEBUG_MATCHING_FLOW=1일 때 줄바꿈(\\r·\\n) 치환 + 긴 값 자르기', (t) => {
    const captured = captureLogs(t, '1');
    logMatchingFlow('bad\r\nstep', { note: 'first\nsecond\rthird', huge: 'x'.repeat(800) });
    assert.equal(captured.length, 1);
    const [prefix, detail] = captured[0];
    assert.equal(prefix, '[MMC-FLOW] bad\\r\\nstep');
    assert.equal(prefix.includes('\n'), false);
    assert.equal(prefix.includes('\r'), false);
    assert.equal(detail.note, 'first\\nsecond\\rthird');
    assert.ok(detail.huge.length <= 161);
});

test('debug_matching_flow 소켓 사건은 클라이언트가 보낸 uuid를 서버 소켓 uuid로 덮어씀', (t) => {
    const captured = captureLogs(t, '1');
    const w = makeWorld(t);
    const s = w.connect('real-socket-user');
    s.trigger('debug_matching_flow', { step: 'enter\ncheck', uuid: 'fake-client-user', extra: 'ok' });
    const hit = captured.find(([tag]) => String(tag).startsWith('[MMC-FLOW] client:'));
    assert.ok(hit, '클라이언트 디버그 로그가 안 찍힘');
    assert.equal(hit[0], '[MMC-FLOW] client:enter\\ncheck');
    assert.equal(hit[1].uuid, 'real-socket-user');
    assert.equal(hit[1].extra, 'ok');
});

test('create_room_ack 디버그 로그에 비공개 방 코드 평문(code) 대신 hasCode만 남김', async (t) => {
    const captured = captureLogs(t, '1');
    const w = makeWorld(t);
    w.connect('creator-1');
    const created = await w.createRoom('creator-1', w.roomPayload({ accessType: 'code', maxPlayers: 5 }));
    assert.equal(created.ok, true);
    const ackLog = captured.find(([tag]) => tag === '[MMC-FLOW] create_room_ack');
    assert.ok(ackLog, 'create_room_ack 로그 없음');
    assert.equal(Object.hasOwn(ackLog[1], 'code'), false);
    assert.equal(ackLog[1].hasCode, true);
    assert.equal(JSON.stringify(ackLog[1]).includes(created.room.roomCode), false);
});
