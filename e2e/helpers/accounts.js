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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 다시 하면 되는 DB 오류: 교착(1213)·잠금 기다림 초과(1205) — 서버·다른 작업자와 같은 표를 동시에 쓸 때 가끔
const isRetryableLockError = (error) => {
    const errno = error?.parent?.errno ?? error?.original?.errno ?? error?.errno;
    return errno === 1213 || errno === 1205 || /Deadlock found|Lock wait timeout/i.test(String(error?.message ?? ''));
};
// 외래키 막힘(1451): 지우는 사이 서버가 그 계정 줄을 새로 씀 (판 끝 결과·접속 기록 등)
const isForeignKeyError = (error) => {
    const errno = error?.parent?.errno ?? error?.original?.errno ?? error?.errno;
    return errno === 1451 || error?.name === 'SequelizeForeignKeyConstraintError';
};

/**
 * fn을 돌리고 다시 해도 되는 오류면 몇 번 더 (쉬는 시간은 점점 길게 + 무작위)
 * @param {() => Promise<any>} fn
 * @param {{ attempts?: number, retryIf?: (e:any)=>boolean, label?: string }} [o]
 */
async function withRetry(fn, { attempts = 5, retryIf = isRetryableLockError, label = 'DB' } = {}) {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= attempts || !retryIf(error)) throw error;
            console.warn(`[e2e] ${label} 다시 (${attempt}): ${String(error?.message ?? error).slice(0, 80)}`);
            await sleep(150 * attempt + Math.random() * 250);
        }
    }
}

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
    // 교착이면 통째로 다시 (트랜잭션이 되돌려져 같은 이메일로 다시 넣어도 됨)
    await withRetry(() => userRepository.withTransaction(async (transaction) => {
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
    }), { label: '계정 만들기' });
    if (o.role && o.role !== 'USER') {
        await db.sequelize.query('UPDATE users SET role = ? WHERE uuid = ?', { replacements: [o.role, uuid] });
    }
    return { uuid, email, password, nickname };
}

// 여러 개: 하나씩 차례로 (Promise.all로 동시에 넣으면 가끔 DB 교착 — 문제목록 ingame-c E2)
async function createAccounts(count, o = {}) {
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(await createAccount(o));
    return out;
}

// 한 번에 지우는 수 (IN 목록이 너무 길지 않게)
const DELETE_CHUNK = 200;

/**
 * 계정 몇 개 지우기 (외래키 딸린 기록까지, backend/scripts/loadtest/accounts.js의 deleteRowsDeep)
 * 지우는 사이 서버가 그 계정 기록을 새로 쓰면(판 끝 game_result_players·접속 기록) 외래키에 막힘 → 딸린 것부터 다시 지움
 * @returns {Promise<number>} 지운 계정 수
 */
async function deleteAccounts(uuids) {
    if (!uuids || uuids.length === 0) return 0;
    const { db, loadtestAccounts } = backend();
    for (let i = 0; i < uuids.length; i += DELETE_CHUNK) {
        const chunk = uuids.slice(i, i + DELETE_CHUNK);
        await withRetry(
            () => loadtestAccounts.deleteRowsDeep(db.sequelize, 'users', 'uuid', chunk),
            { attempts: 6, retryIf: (e) => isForeignKeyError(e) || isRetryableLockError(e), label: '계정 지우기' },
        );
    }
    return uuids.length;
}

// 이메일 모양으로 지우기 (기본: 이번 실행 것만)
async function deleteAccountsLike(like = RUN_EMAIL_LIKE) {
    if (!like.startsWith(EMAIL_PREFIX) || !like.endsWith(EMAIL_DOMAIN)) throw new Error('e2e 계정 모양만 지움');
    const { db } = backend();
    const [rows] = await db.sequelize.query('SELECT uuid FROM users WHERE email LIKE ?', { replacements: [like] });
    return deleteAccounts(rows.map((r) => r.uuid));
}

/**
 * 오래된 e2e 계정만 지우기 (만든 지 hours시간 넘은 것) — 실행 시작 정리용, 지금 도는 남의 실행 계정은 안 건드림
 * @param {number} [hours=6]
 */
async function deleteStaleAccounts(hours = 6) {
    const { db } = backend();
    const [rows] = await db.sequelize.query(
        'SELECT uuid FROM users WHERE email LIKE ? AND created_at < UTC_TIMESTAMP() - INTERVAL ? HOUR',
        { replacements: [ALL_E2E_EMAIL_LIKE, Number(hours)] },
    );
    return deleteAccounts(rows.map((r) => r.uuid));
}

module.exports = {
    RUN_ID, RUN_EMAIL_LIKE, ALL_E2E_EMAIL_LIKE, EMAIL_DOMAIN,
    createAccount, createAccounts, deleteAccounts, deleteAccountsLike, deleteStaleAccounts, randomPassword, randomNickname,
    withRetry, isRetryableLockError, isForeignKeyError,
};
