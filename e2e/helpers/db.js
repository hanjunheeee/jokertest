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

// SQL 한 줄 (확인용), 결과 줄 배열
async function query(sql, replacements = []) {
    const { db } = backend();
    const [rows] = await db.sequelize.query(sql, { replacements });
    return rows;
}

// 프로세스에서 한 번만 (닫은 뒤엔 같은 모델을 다시 못 엶)
async function close() {
    if (!loaded) return;
    await loaded.db.sequelize.close();
    loaded = null;
}

module.exports = { backend, query, close };
