'use strict';

// 도구 시험: 기기 종류·접속 IP · 이메일 가리기 · 앱 오류 · 비번 해시·토큰 · 방 코드 글자
process.env.JWT_SECRET = process.env.JWT_SECRET || 'audit-2026-11-09-utils-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { getDeviceType, getClientIp } = require('../../utils/request');
const { maskEmail, FALLBACK_MASK } = require('../../utils/auth/maskEmail');
const { AppError, createError } = require('../../utils/appError');
const credentials = require('../../utils/auth/credentials');
const { generateRoomCode, generateUniqueRoomCode } = require('../../utils/roomCode');

test('기기 종류: 브라우저 정보가 없거나 빈 문자열이면 UNKNOWN', () => {
    assert.equal(getDeviceType(undefined), 'UNKNOWN');
    assert.equal(getDeviceType(''), 'UNKNOWN');
});

test('기기 종류: 아이패드·모바일 표시 없는 안드로이드는 TABLET', () => {
    assert.equal(getDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'TABLET');
    assert.equal(getDeviceType('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/120 Safari/537.36'), 'TABLET');
});

test('기기 종류: 아이폰·모바일 안드로이드는 MOBILE', () => {
    assert.equal(getDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'MOBILE');
    assert.equal(getDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), 'MOBILE');
});

test('기기 종류: 윈도우·맥 데스크톱은 PC', () => {
    assert.equal(getDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), 'PC');
    assert.equal(getDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605'), 'PC');
});

test('접속 IP: x-forwarded-for는 사람이 마음대로 넣을 수 있어 안 읽고 req.ip를 쓴다', () => {
    assert.equal(getClientIp({ headers: { 'x-forwarded-for': '6.6.6.6' }, ip: '1.2.3.4' }), '1.2.3.4');
});

test('접속 IP: req.ip가 없으면 연결 주소, IPv6 모양도 그대로', () => {
    assert.equal(getClientIp({ headers: {}, connection: { remoteAddress: '::ffff:127.0.0.1' }, socket: {} }), '::ffff:127.0.0.1');
});

test('접속 IP: 아무 정보도 없거나 연결 객체가 없어도 오류 없이 UNKNOWN', () => {
    assert.equal(getClientIp({ headers: {}, connection: {}, socket: {} }), 'UNKNOWN');
    assert.equal(getClientIp({ headers: {} }), 'UNKNOWN');
});

test('접속 IP: 기록 칸(45자)을 넘거나 IP 글자가 아닌 값은 UNKNOWN', () => {
    assert.equal(getClientIp({ headers: {}, ip: '1'.repeat(46) }), 'UNKNOWN');
    assert.equal(getClientIp({ headers: {}, ip: "1.2.3.4'; DROP" }), 'UNKNOWN');
});

test('이메일 가리기: 앞은 첫·끝 글자, 뒤는 첫 글자와 마지막 점 뒤만 남긴다', () => {
    assert.equal(maskEmail('abcdef@gmail.com'), 'a***f@g***.com');
    assert.equal(maskEmail('jerry@naver.co.kr'), 'j***y@n***.kr');
});

test('이메일 가리기: 앞이 한 글자·두 글자면 더 가린다', () => {
    assert.equal(maskEmail('a@x.com'), '*@x***.com');
    assert.equal(maskEmail('ab@x.com'), 'a*@x***.com');
});

test('이메일 가리기: 점 없는 도메인은 첫 글자만 남긴다', () => {
    assert.equal(maskEmail('abc@localhost'), 'a***c@l***');
});

test('이메일 가리기: 결과에 원래 앞부분 전체가 남지 않는다', () => {
    const masked = maskEmail('secretname@example.com');
    assert.equal(masked.includes('secretname'), false);
    assert.equal(masked.includes('example'), false);
});

test('이메일 가리기: @ 없음·@로 시작·@로 끝·문자열 아님은 대체 문구', () => {
    for (const value of ['plain', '@x.com', 'a@', null, 123, undefined]) {
        assert.equal(maskEmail(value), FALLBACK_MASK, String(value));
    }
});

test('앱 오류: 상태 기본값 500, code를 안 주면 code 칸이 아예 없다', () => {
    const error = createError('x');
    assert.equal(error.status, 500);
    assert.equal(Object.prototype.hasOwnProperty.call(error, 'code'), false);
    assert.ok(error instanceof AppError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AppError');
});

test('앱 오류: 준 상태·code·문구가 그대로 실린다', () => {
    const error = createError('없음', 404, 'NOT_FOUND');
    assert.deepEqual({ message: error.message, status: error.status, code: error.code }, { message: '없음', status: 404, code: 'NOT_FOUND' });
});

test('비번 해시: 해시는 원문과 다르고 같은 비번은 맞음, 한 글자 다르면 틀림', async () => {
    const hash = await credentials.hashPassword('password1!');
    assert.notEqual(hash, 'password1!');
    assert.equal(await credentials.comparePassword('password1!', hash), true);
    assert.equal(await credentials.comparePassword('password1?', hash), false);
});

test('비번 해시: 같은 비번도 해시할 때마다 다른 값 (소금)', async () => {
    const [a, b] = await Promise.all([credentials.hashPassword('samepass1'), credentials.hashPassword('samepass1')]);
    assert.notEqual(a, b);
});

test('토큰: 유효 시간을 안 주면 하루(86400초)', () => {
    const token = credentials.generateToken({ uuid: 'u' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.uuid, 'u');
    assert.equal(decoded.exp - decoded.iat, 86400);
});

test('토큰: 준 유효 시간(초)이 그대로 들어가고 다른 비밀키로는 못 푼다', () => {
    const token = credentials.generateToken({ uuid: 'u' }, { expiresIn: 900 });
    const decoded = jwt.decode(token);
    assert.equal(decoded.exp - decoded.iat, 900);
    assert.throws(() => jwt.verify(token, 'other-secret'));
});

test('방 코드: 6자리이고 헷갈리는 글자(I·O·0·1)가 없다 (여러 번 만들어 확인)', () => {
    for (let i = 0; i < 200; i += 1) {
        const code = generateRoomCode();
        assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    }
});

test('방 코드: 예약 판정이 예외를 던지면 그 코드는 안 쓰고 다음 코드를 고른다', () => {
    const codes = ['AAAAAA', 'BBBBBB'];
    const originalError = console.error;
    console.error = () => {};
    try {
        const code = generateUniqueRoomCode(new Map(), {
            generator: () => codes.shift(),
            isReserved: (c) => { if (c === 'AAAAAA') throw new Error('boom'); return false; },
        });
        assert.equal(code, 'BBBBBB');
    } finally {
        console.error = originalError;
    }
});

test('방 코드: 시도 횟수 0이면 바로 null', () => {
    assert.equal(generateUniqueRoomCode(new Map(), { retry: 0 }), null);
});
