'use strict';

// 플레이어 문의 시험 (DB 없이), 모양 검사(AD-264)·로그인 없음 401·오류 응답 모양·알림 모양
// npm test가 돌림, 진짜 DB 시험은 inquiry.integration.test.js
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const write = require('../../services/inquiry/write');
const read = require('../../services/inquiry/read');

// 오류 코드만 꺼내기 (던지면 code, 안 던지면 null)
const codeOf = (fn) => {
    try { fn(); return null; } catch (error) { return `${error.status}:${error.code}`; }
};

const ok = { category: 'BUG', title: '방이 안 열려요', body: '방 만들기 누르면 멈춤' };

test('AD-264: 모양 검사 — 종류·제목 1~100·본문 1~2000·모르는 칸', () => {
    assert.deepEqual(write.validateInquiry(ok), ok);
    // 앞뒤 공백은 빼고 저장
    assert.deepEqual(write.validateInquiry({ ...ok, title: '  제목  ', body: ' 본문 ' }), { ...ok, title: '제목', body: '본문' });
    for (const category of ['BUG', 'ACCOUNT', 'ETC']) {
        assert.equal(write.validateInquiry({ ...ok, category }).category, category);
    }
    assert.equal(write.validateInquiry({ ...ok, title: 'a'.repeat(100), body: 'b'.repeat(2000) }).title.length, 100);

    const bad = [
        null,
        {},
        { ...ok, category: 'bug' },
        { ...ok, category: 'PAY' },
        { ...ok, title: '' },
        { ...ok, title: '   ' },
        { ...ok, title: 'a'.repeat(101) },
        { ...ok, title: 3 },
        { ...ok, body: '' },
        { ...ok, body: 'b'.repeat(2001) },
        { ...ok, body: ['글'] },
        { ...ok, status: 'ANSWERED' },
        { ...ok, userId: 'someone' },
    ];
    for (const body of bad) {
        assert.equal(codeOf(() => write.validateInquiry(body)), '400:INVALID_INQUIRY', JSON.stringify(body));
    }
});

test('AD-264: 제한 값은 경계 약속 그대로 (1분 2번·하루 10번·답 기다림 5개)', () => {
    assert.deepEqual({ ...write.INQUIRY_LIMITS }, { perMinute: 2, perDay: 10, open: 5 });
    assert.deepEqual({ ...read.INQUIRY_STATUS }, { OPEN: 'OPEN', ANSWERED: 'ANSWERED' });
});

test('2-16 약속: 답 알림 모양', () => {
    assert.deepEqual(read.inquiryReplyNotification({ replyId: 7, inquiryId: 3, title: '방이 안 열려요' }), {
        type: 'system',
        sourceKey: 'inquiry-reply:7',
        title: '문의에 답이 왔어요',
        body: '방이 안 열려요',
        target: { kind: 'inquiry', inquiryId: 3 },
    });
});

// /inquiries만 붙인 시험 서버
const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/inquiries', require('../../routes/inquiry.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
    return url;
};

test('AD-263: 로그인 없으면 세 경로 모두 401', async (t) => {
    const url = await startServer(t);
    const answers = await Promise.all([
        fetch(`${url}/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ok) }),
        fetch(`${url}/inquiries`),
        fetch(`${url}/inquiries/1`),
    ]);
    assert.deepEqual(answers.map((res) => res.status), [401, 401, 401]);
});

test('오류 응답 모양: 문의 오류는 { ok:false, code, message }', async () => {
    const controller = require('../../controllers/inquiry.controller');
    const sent = {};
    const res = {
        status(code) { sent.status = code; return this; },
        json(body) { sent.body = body; return this; },
    };
    let passed = null;
    const realCreate = write.createInquiry;
    write.createInquiry = async () => { throw write.inquiryError('너무 자주 썼어요.', 429, 'INQUIRY_RATE_LIMITED'); };
    try {
        await controller.createInquiry({ user: { uuid: 'u1' }, body: ok }, res, (error) => { passed = error; });
    } finally {
        write.createInquiry = realCreate;
    }
    assert.equal(passed, null);
    assert.equal(sent.status, 429);
    assert.deepEqual(sent.body, { ok: false, code: 'INQUIRY_RATE_LIMITED', message: '너무 자주 썼어요.' });

    // 문의 오류가 아니면 공용 오류 처리기로 넘김
    write.createInquiry = async () => { throw new Error('db down'); };
    try {
        await controller.createInquiry({ user: { uuid: 'u1' }, body: ok }, res, (error) => { passed = error; });
    } finally {
        write.createInquiry = realCreate;
    }
    assert.equal(passed?.message, 'db down');
});
