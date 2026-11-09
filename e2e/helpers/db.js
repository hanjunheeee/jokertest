'use strict';

// 시험 DB 붙기 파일, 백엔드 모델·저장소를 시험 DB(joker_e2e)로 불러 씀 (시험 프로세스마다 한 번)
// accounts.js(계정 만들기·지우기)와 DB 상태를 직접 확인하는 시험이 씀 — 개발 DB 주소는 절대 안 씀
const path = require('node:path');
const { BACKEND_DIR, readSecrets } = require('./env');

let loaded = null;

// 백엔드 모듈 불러오기 (처음 부를 때 DB 주소를 시험 DB로 박고 나서)
function backend() {
    if (loaded) return loaded;
    const { DATABASE_URL } = readSecrets();
    if (!/\/joker_e2e(\?|$)/.test(DATABASE_URL)) throw new Error('시험 DB 주소가 joker_e2e가 아님 → npm run db:setup');
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = 'development';
    // 개발 설정은 SQL을 다 찍어서 그 줄만 숨김 (시험 출력 깨끗하게)
    if (!console.log.__e2eQuiet) {
        const original = console.log;
        const quiet = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('Executing (')) return; original(...args); };
        quiet.__e2eQuiet = true;
        console.log = quiet;
    }
    const req = (rel) => require(path.join(BACKEND_DIR, rel));
    loaded = {
        db: req('models'),
        userRepository: req('repositories/user'),
        credentials: req('utils/auth/credentials'),
        economyService: req('services/economy'),
        termsService: req('services/auth/terms'),
        termsRepository: req('repositories/auth/terms'),
        loadtestAccounts: req('scripts/loadtest/accounts'),
    };
    return loaded;
}

/**
 * DB 시각 글자 (UTC, 'YYYY-MM-DD HH:MM:SS') — 앱은 시각을 UTC로 적음
 * 날 SQL 값에 JS Date를 그대로 넣으면 이 PC 시간대(KST)로 바뀌어 9시간 어긋남 → 이 함수로 바꿔 넣기 (query는 Date를 알아서 바꿈)
 * @param {Date|number|string|null} [at] Date·ms·날짜 글자 — 인자 없으면 지금, null·undefined를 넘기면 null
 * @example sqlTime() // '2026-11-09 03:25:51'  ·  sqlTime(Date.now() + 3600e3) // 한 시간 뒤
 */
function sqlTime(...args) {
    if (args.length === 0) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [at] = args;
    if (at === null || at === undefined) return null;
    const date = at instanceof Date ? at : new Date(at);
    if (Number.isNaN(date.getTime())) throw new Error(`sqlTime: 날짜가 아님 (${String(at)})`);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// 넣을 값 속 Date만 UTC 글자로 (배열·{이름: 값} 둘 다)
const fixDates = (replacements) => {
    const fix = (v) => (v instanceof Date ? sqlTime(v) : v);
    if (Array.isArray(replacements)) return replacements.map(fix);
    if (replacements && typeof replacements === 'object') return Object.fromEntries(Object.entries(replacements).map(([k, v]) => [k, fix(v)]));
    return replacements;
};

// SQL 한 줄 (확인용), 결과 줄 배열 — 값에 Date가 있으면 UTC 글자로 바꿔 넣음 (9시간 어긋남 막기)
async function query(sql, replacements = []) {
    const { db } = backend();
    const [rows] = await db.sequelize.query(sql, { replacements: fixDates(replacements) });
    return rows;
}

// 프로세스에서 한 번만 (닫은 뒤엔 같은 모델을 다시 못 엶)
async function close() {
    if (!loaded) return;
    await loaded.db.sequelize.close();
    loaded = null;
}

module.exports = { backend, query, close, sqlTime };
