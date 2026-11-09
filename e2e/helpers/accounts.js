'use strict';

// 시험 계정 파일, 시험마다 새 계정을 실제 가입과 같게 만듦 (계정 → 통계 → 기본 지급 → 약관 동의, 이메일 인증 끝남·만 14세 넘음)
// fixtures.js의 accounts 도우미와 전체 정리(global-teardown)가 씀, 모양은 backend/scripts/seed-dev-testers.js와 같음
const crypto = require('node:crypto');
const { backend } = require('./db');

// 이번 실행 번호 (같은 실행의 모든 작업자가 같은 값, playwright.config.js가 정함)
const RUN_ID = process.env.E2E_RUN_ID || 'local';
const EMAIL_DOMAIN = '@example.test';
const EMAIL_PREFIX = 'e2e+';
// 지울 때 이 모양만 (다른 계정은 절대 안 건드림)
const RUN_EMAIL_LIKE = `${EMAIL_PREFIX}${RUN_ID}-%${EMAIL_DOMAIN}`;
const ALL_E2E_EMAIL_LIKE = `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`;

// 작업자 번호 + 차례로 겹치지 않는 번호
let counter = 0;
const nextSerial = () => {
    counter += 1;
    const worker = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0';
    return `${worker}x${counter}${crypto.randomBytes(2).toString('hex')}`;
};

// 비번은 계정마다 무작위 (화면·로그에 안 찍음), 가입 규칙(8자 이상·글자 섞기)에 맞게
const randomPassword = () => `E2e!${crypto.randomBytes(12).toString('base64url')}9a`;

// 닉네임: 2~8자·한글영문숫자만 규칙 안에서 겹치지 않게 (앞 글자로 누가 만든 건지 보임)
const randomNickname = (prefix = 't') => `${prefix}${crypto.randomBytes(4).toString('hex')}`.slice(0, 8);

let termsIdsCache = null;
async function currentTermsIds() {
    if (termsIdsCache) return termsIdsCache;
    const { termsService, termsRepository } = backend();
    // 종류마다 가장 늦은 약관 (시행 전 버전도 포함, 재동의 창 안 뜨게)
    const FAR_FUTURE = new Date(Date.UTC(9999, 0, 1));
    termsIdsCache = termsService.pickCurrentVersions(await termsRepository.findAllVersions(), FAR_FUTURE).map((t) => Number(t.id));
    return termsIdsCache;
}

/**
 * 계정 하나 만들기
 * @param {object} [o]
 * @param {string} [o.nickname] 닉네임 (없으면 무작위)
 * @param {string} [o.password] 비번 (없으면 무작위)
 * @param {Date}   [o.birthDate] 생일 (기본 2000-01-01 = 만 14세 넘음)
 * @param {boolean}[o.emailVerified=true]
 * @param {boolean}[o.agreeTerms=true] 약관 동의 넣을지 (false면 재동의 창 시험용)
 * @param {boolean}[o.defaultItems=true] 기본 사진·테두리·이모티콘 지급
 * @param {string} [o.role='USER'] 'USER' | 'ADMIN'
 * @returns {Promise<{uuid:string,email:string,password:string,nickname:string}>}
 */
async function createAccount(o = {}) {
    const { db, userRepository, credentials, economyService, termsService } = backend();
    const email = o.email ?? `${EMAIL_PREFIX}${RUN_ID}-${nextSerial()}${EMAIL_DOMAIN}`;
    const password = o.password ?? randomPassword();
    const nickname = o.nickname ?? randomNickname();
    const passwordHash = await credentials.hashPassword(password);
    const agreedIds = o.agreeTerms === false ? [] : await currentTermsIds();
    let uuid = null;
    await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.createUser({
            email,
            password_hash: passwordHash,
            nickname,
            birth_date: o.birthDate ?? new Date(Date.UTC(2000, 0, 1)),
            email_verified: o.emailVerified !== false,
        }, { transaction });
        uuid = user.uuid;
        await userRepository.createUserStats(user.uuid, { transaction });
        if (o.defaultItems !== false) await economyService.ensureDefaultEntitlements(user.uuid, db, { transaction });
        if (agreedIds.length > 0) await termsService.recordAgreements(user.uuid, agreedIds, { transaction });
    });
    if (o.role && o.role !== 'USER') {
        await db.sequelize.query('UPDATE users SET role = ? WHERE uuid = ?', { replacements: [o.role, uuid] });
    }
    return { uuid, email, password, nickname };
}

// 여러 개 한 번에
async function createAccounts(count, o = {}) {
    return Promise.all(Array.from({ length: count }, () => createAccount(o)));
}

// 계정 몇 개 지우기 (외래키 딸린 기록까지, backend/scripts/loadtest/accounts.js의 deleteRowsDeep)
async function deleteAccounts(uuids) {
    if (!uuids || uuids.length === 0) return 0;
    const { db, loadtestAccounts } = backend();
    await loadtestAccounts.deleteRowsDeep(db.sequelize, 'users', 'uuid', uuids);
    return uuids.length;
}

// 이메일 모양으로 지우기 (기본: 이번 실행 것만)
async function deleteAccountsLike(like = RUN_EMAIL_LIKE) {
    if (!like.startsWith(EMAIL_PREFIX) || !like.endsWith(EMAIL_DOMAIN)) throw new Error('e2e 계정 모양만 지움');
    const { db } = backend();
    const [rows] = await db.sequelize.query('SELECT uuid FROM users WHERE email LIKE ?', { replacements: [like] });
    return deleteAccounts(rows.map((r) => r.uuid));
}

module.exports = {
    RUN_ID, RUN_EMAIL_LIKE, ALL_E2E_EMAIL_LIKE, EMAIL_DOMAIN,
    createAccount, createAccounts, deleteAccounts, deleteAccountsLike, randomPassword, randomNickname,
};
