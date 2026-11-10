'use strict';

// 이메일 바꾸기 번호 보내기 동시 시험 파일, 서로 다른 계정 셋이 같은 새 주소로 같은 순간 요청
// 진짜 시험 DB + 서비스 직접 호출, 메일은 메모리 가짜 (F01_TEST_DATABASE_URL 없으면 건너뜀)
// npm run test:with-db -- tests/db/emailChange-request.odd.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'email-change-odd-test-secret';
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET || 'email-change-odd-test-hmac-secret-0123456789';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb } = require('../admin/helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const db = () => require('../../models');
const mailAdapterModule = require('../../utils/adapters/mail');
const emailChange = require('../../services/auth/emailChange');

const rand = () => crypto.randomBytes(4).toString('hex');

// 소셜 전용 계정 (현재 비번 확인 없이 번호만)
const createUser = async (label) => {
    const uuid = crypto.randomUUID();
    await db().User.create({
        uuid, email: `old-${label}-${rand()}@example.com`.toLowerCase(), password_hash: 'x-social-only', has_local_password: false,
        nickname: `바${rand()}`.slice(0, 10), birth_date: new Date('1990-01-01'), email_verified: true,
    });
    return uuid;
};

test('[동시] 서로 다른 계정 셋이 같은 새 주소로 같은 순간 번호 요청 → 교착 500 없이 하나만 보내지고 둘은 RESEND_TOO_SOON, 메일 한 통', async (t) => {
    if (!TEST_DB_URL) { t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함'); return; }
    const memory = mailAdapterModule.createMemoryMailAdapter();
    const newEmail = `chg-${rand()}@example.com`.toLowerCase();
    const uuids = await Promise.all(['a', 'b', 'c'].map(createUser));
    const results = await Promise.allSettled(uuids.map((uuid) => emailChange.requestEmailChangeCode(
        { uuid, newEmail }, { mailAdapter: memory },
    )));
    const summary = results.map((r) => (r.status === 'fulfilled' ? 'ok' : `${r.reason.status}:${r.reason.code ?? r.reason.original?.code}`));
    assert.deepEqual(summary.sort(), ['429:RESEND_TOO_SOON', '429:RESEND_TOO_SOON', 'ok'], JSON.stringify(summary));
    assert.equal(memory.outbox.filter((mail) => mail.to === newEmail).length, 1);
});
