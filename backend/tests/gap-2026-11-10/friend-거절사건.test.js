'use strict';

// 빈칸 채우기 시험: 친구 신청 거절 → 신청한 사람에게 friend_request_declined 사건 (컨트롤러 → 알림 → 소켓 창구)
// 서비스 저장만 가짜, 알림·창구(emitter)는 진짜 코드 그대로 — 빈칸찾기 하 13
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const emitter = require('../../socket/emitter');
const friendService = require('../../services/friend');
const friendController = require('../../controllers/friend');

// 소켓 창구 흉내: 보낸 것 [{ channel, event, payload }] 모음, 시험 끝에 되돌림
function captureEmits(t) {
    const sent = [];
    emitter.setIo({ to: (channel) => ({ emit: (event, payload) => sent.push({ channel, event, payload }) }) });
    t.after(() => { emitter.setIo(null); });
    return sent;
}

// 컨트롤러 부르기 → 응답 또는 next 오류
const call = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        set() { return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    Promise.resolve(handler({ user: { uuid: 'receiver' }, params: {}, query: {}, ...req }, res, (error) => resolve({ error })));
});

test('거절하면 → 신청한 사람 계정 채널에만 friend_request_declined { byUuid: 거절한 사람, 효과음 id } 가 감', async (t) => {
    t.mock.method(friendService, 'declineRequest', async (me, requestId) => {
        assert.deepEqual([me, requestId], ['receiver', 41]);
        return { requesterId: 'requester' };
    });
    const sent = captureEmits(t);
    const out = await call(friendController.declineRequest, { params: { id: '41' } });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body.data, { request_id: 41, status: 'DECLINED' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].channel, 'user:requester');
    assert.equal(sent[0].event, 'friend_request_declined');
    assert.equal(sent[0].payload.byUuid, 'receiver');
    assert.deepEqual(sent[0].payload.sfxEvent, {
        kind: 'friend-request-declined', eventId: 'friend-request:41:declined', accountId: 'requester', origin: 'live',
    });
});

test('거절 저장이 실패하면 → 사건 안 보내고 오류로 넘김', async (t) => {
    t.mock.method(friendService, 'declineRequest', async () => { throw Object.assign(new Error('없음'), { status: 404 }); });
    const sent = captureEmits(t);
    const out = await call(friendController.declineRequest, { params: { id: '7' } });
    assert.equal(out.error.status, 404);
    assert.deepEqual(sent, []);
});

test('창구가 보내다 터져도 → 거절 응답은 그대로 200 (저장은 이미 끝남)', async (t) => {
    t.mock.method(friendService, 'declineRequest', async () => ({ requesterId: 'requester' }));
    t.mock.method(console, 'error', () => {});
    emitter.setIo({ to: () => ({ emit() { throw new Error('boom'); } }) });
    t.after(() => { emitter.setIo(null); });
    const out = await call(friendController.declineRequest, { params: { id: '8' } });
    assert.equal(out.status, 200);
    assert.equal(console.error.mock.calls[0].arguments[0], '[친구 사건 통지 실패]');
});
