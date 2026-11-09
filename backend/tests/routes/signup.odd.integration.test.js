'use strict';

// 가입·메일 인증 이상한 순서·동시 시험 파일, 인증번호 요청·확인 따닥, 같은 닉네임 동시 가입, 증명 받은 뒤 다시 보내기와 가입이 겹칠 때
// 진짜 시험 DB + 진짜 /auth 라우터(HTTP), 메일은 메모리 가짜(진짜 메일 안 감), 약관 검사는 통과로
// npm run test:with-db -- tests/routes/signup.odd.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'signup-odd-test-secret';
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET || 'signup-odd-test-hmac-secret-0123456789';
// 요청 수 제한은 이 시험 몫 아님 → 넉넉히
process.env.SIGNUP_EMAIL_HOUR_MAX = '1000';
process.env.SIGNUP_EMAIL_DAY_MAX = '1000';
process.env.SIGNUP_IP_HOUR_MAX = '1000';
process.env.SIGNUP_IP_DAY_MAX = '1000';
require('../helpers/termsStub').passSignupTermsForFile();

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { prepareAdminDb } = require('../admin/helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const mailAdapterModule = require('../../utils/adapters/mail');

// /auth 라우터만 붙인 시험 서버 → 주소
const startServer = async (t) => {
    const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

// 메일을 메모리로 (진짜로 안 보냄)
const useMemoryMail = (t) => {
    const memory = mailAdapterModule.createMemoryMailAdapter();
    t.mock.method(mailAdapterModule, 'createHttpMailAdapter', () => memory);
    return memory;
};

const post = async (base, path, body) => {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
};

const SIGNUP_FIELDS = { password: 'pw12345678', passwordConfirm: 'pw12345678', birthDate: '2000-01-01' };
// 서버가 소문자로 바꿔 보내므로 처음부터 소문자 (메일 받는 주소 비교가 맞게)
const newEmail = (label) => `odd-${label}-${crypto.randomBytes(4).toString('hex')}@example.com`.toLowerCase();
const codesTo = (memory, email) => memory.outbox.filter((mail) => mail.to === email && mail.template === 'SIGNUP_CODE');

// 번호 받기 → 확인 → 증명
const proofFor = async (base, memory, email) => {
    const sent = await post(base, '/auth/signup/email-code', { email });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const code = codesTo(memory, email).at(-1).params.code;
    const verified = await post(base, '/auth/signup/email-code/verify', { email, code });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    return verified.body.signupProof;
};

const usersWithEmail = (email) => db().User.count({ where: { email }, paranoid: false });

test('[따닥] 같은 이메일로 인증번호 받기 세 번이 같은 순간 → 200 하나·429 RESEND_TOO_SOON 둘, 메일 한 통', async (t) => {
    if (skipWithoutDb(t)) return;
    const memory = useMemoryMail(t);
    const base = await startServer(t);
    const email = newEmail('code3');
    const results = await Promise.all([1, 2, 3].map(() => post(base, '/auth/signup/email-code', { email })));
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 429, 429], JSON.stringify(results));
    for (const res of results.filter((one) => one.status === 429)) assert.equal(res.body.code, 'RESEND_TOO_SOON');
    assert.equal(codesTo(memory, email).length, 1);
});

test('[따닥] 맞는 번호 확인 세 번이 같은 순간 → 증명은 하나만(200 하나·400 CODE_INVALID 둘), 그 증명으로 가입 됨', async (t) => {
    if (skipWithoutDb(t)) return;
    const memory = useMemoryMail(t);
    const base = await startServer(t);
    const email = newEmail('verify3');
    await post(base, '/auth/signup/email-code', { email });
    const { code } = codesTo(memory, email).at(-1).params;
    const results = await Promise.all([1, 2, 3].map(() => post(base, '/auth/signup/email-code/verify', { email, code })));
    const won = results.filter((res) => res.status === 200);
    assert.equal(won.length, 1, JSON.stringify(results));
    for (const res of results.filter((one) => one.status !== 200)) assert.deepEqual([res.status, res.body.code], [400, 'CODE_INVALID']);
    const signup = await post(base, '/auth/signup', { email, nickname: `증명${crypto.randomBytes(2).toString('hex')}`, ...SIGNUP_FIELDS, signupProof: won[0].body.signupProof });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
});

test('[동시] 틀린 번호 7번이 같은 순간 → 틀린 횟수는 5에서 멈추고, 그 뒤 맞는 번호도 429 TOO_MANY_ATTEMPTS', async (t) => {
    if (skipWithoutDb(t)) return;
    const memory = useMemoryMail(t);
    const base = await startServer(t);
    const email = newEmail('wrong7');
    await post(base, '/auth/signup/email-code', { email });
    const { code } = codesTo(memory, email).at(-1).params;
    const wrong = code === '000000' ? '111111' : '000000';
    const results = await Promise.all(Array.from({ length: 7 }, () => post(base, '/auth/signup/email-code/verify', { email, code: wrong })));
    for (const res of results) assert.ok([400, 429].includes(res.status), JSON.stringify(res));
    const [row] = await db().sequelize.query('SELECT attempts FROM signup_email_verifications WHERE email = :email', {
        replacements: { email }, type: db().Sequelize.QueryTypes.SELECT,
    });
    assert.equal(row.attempts, 5);
    const right = await post(base, '/auth/signup/email-code/verify', { email, code });
    assert.deepEqual([right.status, right.body.code], [429, 'TOO_MANY_ATTEMPTS']);
});

test('[동시] 다른 이메일 둘이 같은 닉네임으로 같은 순간 가입 → 하나 200, 다른 쪽 409(500 아님), 진 쪽 증명은 되돌아가 다른 닉네임으로 가입 됨', async (t) => {
    if (skipWithoutDb(t)) return;
    const memory = useMemoryMail(t);
    const base = await startServer(t);
    const emailA = newEmail('nickA');
    const emailB = newEmail('nickB');
    const proofA = await proofFor(base, memory, emailA);
    const proofB = await proofFor(base, memory, emailB);
    const nickname = `겹침${crypto.randomBytes(2).toString('hex')}`;
    const [ra, rb] = await Promise.all([
        post(base, '/auth/signup', { email: emailA, nickname, ...SIGNUP_FIELDS, signupProof: proofA }),
        post(base, '/auth/signup', { email: emailB, nickname, ...SIGNUP_FIELDS, signupProof: proofB }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409], JSON.stringify([ra, rb]));
    assert.equal(await db().User.count({ where: { nickname }, paranoid: false }), 1);
    const loser = ra.status === 409 ? { email: emailA, proof: proofA } : { email: emailB, proof: proofB };
    const retry = await post(base, '/auth/signup', { email: loser.email, nickname: `${nickname}b`, ...SIGNUP_FIELDS, signupProof: loser.proof });
    assert.equal(retry.status, 200, `진 쪽 증명 다시 쓰기 ${JSON.stringify(retry.body)}`);
});

test('[이상한 순서+동시] 증명 받은 뒤(대기 시간 지남) 다시 보내기와 가입이 같은 순간 → 가입 성공이면 새 번호 메일 없음, 실패면 401·계정 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    const memory = useMemoryMail(t);
    const base = await startServer(t);
    const email = newEmail('resend');
    const proof = await proofFor(base, memory, email);
    // 다시 보내기 대기(60초)가 지난 것처럼 보낸 시각을 2분 전으로
    await db().sequelize.query('UPDATE signup_email_verifications SET sent_at = DATE_SUB(sent_at, INTERVAL 2 MINUTE) WHERE email = :email', { replacements: { email } });
    const mailsBefore = codesTo(memory, email).length;
    const [resend, signup] = await Promise.all([
        post(base, '/auth/signup/email-code', { email }),
        post(base, '/auth/signup', { email, nickname: `재발${crypto.randomBytes(2).toString('hex')}`, ...SIGNUP_FIELDS, signupProof: proof }),
    ]);
    assert.equal(resend.status, 200, JSON.stringify(resend.body));
    const newMails = codesTo(memory, email).length - mailsBefore;
    if (signup.status === 200) {
        assert.equal(await usersWithEmail(email), 1);
        assert.equal(newMails, 0, '가입이 끝난 이메일로 새 번호 메일이 감');
    } else {
        assert.deepEqual([signup.status, signup.body.code], [401, 'SIGNUP_PROOF_INVALID'], JSON.stringify(signup.body));
        assert.equal(await usersWithEmail(email), 0);
        assert.equal(newMails, 1);
    }
});
