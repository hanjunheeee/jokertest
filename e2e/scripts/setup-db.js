#!/usr/bin/env node
'use strict';

// 브라우저 시험 전용 DB 만들기 파일, docker jokertest-db-1 안에 joker_e2e DB와 그 DB만 쓰는 계정을 만들고 마이그레이션 0001~0029 + 시험 상품
// 쓰는 법(e2e 폴더): npm run db:setup (없으면 만들고 마이그레이션만) / npm run db:reset (지우고 새로)
// - 개발 DB(joker·joker_realgame)와 백엔드 시험 DB(pluto_f01_20260909_al)는 안 건드림: 아래 SQL은 joker_e2e와 mmc_e2e 계정만
// - 비밀값(DB 비번·JWT·HMAC·내부 열쇠)은 처음 한 번 무작위로 만들어 e2e/.env.e2e에만 씀 (화면에 안 찍음, git 안 올라감)
// - 토스 시험 키는 backend/.env에서 TOSS_TEST_* 만 옮겨 적음 (값은 안 찍음)
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const E2E_DIR = path.join(__dirname, '..');
const BACKEND_DIR = path.join(E2E_DIR, '..', 'backend');
const ENV_FILE = path.join(E2E_DIR, '.env.e2e');
const CONTAINER = process.env.E2E_DB_CONTAINER || 'jokertest-db-1';
const DB_NAME = 'joker_e2e';
const DB_USER = 'mmc_e2e';
const HOST_PORT = process.env.E2E_DB_PORT || '3306';
const PROTECTED_DBS = ['joker', 'joker_realgame', 'pluto_f01_20260909_al'];

if (PROTECTED_DBS.includes(DB_NAME)) throw new Error(`개발 DB 이름은 못 씀: ${DB_NAME}`);

const randomToken = (bytes) => crypto.randomBytes(bytes).toString('base64url').replace(/[^A-Za-z0-9]/g, '');

// .env 모양 파일 읽기 (KEY=VALUE 줄만)
const readEnvFile = (file) => {
    if (!fs.existsSync(file)) return {};
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim();
    }
    return out;
};

// 있던 값은 살리고 빠진 비밀값만 새로 (다시 돌려도 로그인 쿠키·DB 비번이 안 바뀌게, --reset이면 DB 비번만 새로)
const buildEnv = (reset) => {
    const current = readEnvFile(ENV_FILE);
    const backendEnv = readEnvFile(path.join(BACKEND_DIR, '.env'));
    const dbPassword = (!reset && current.E2E_DB_PASSWORD) || randomToken(24).slice(0, 28);
    const env = {
        E2E_DB_PASSWORD: dbPassword,
        DATABASE_URL: `mysql://${DB_USER}:${dbPassword}@127.0.0.1:${HOST_PORT}/${DB_NAME}`,
        JWT_SECRET: current.JWT_SECRET || randomToken(48),
        SIGNUP_EMAIL_HMAC_SECRET: current.SIGNUP_EMAIL_HMAC_SECRET || randomToken(48),
        INTERNAL_API_KEY: current.INTERNAL_API_KEY || randomToken(48),
        // 관리자 OTP 비밀 잠금 열쇠 (16진수 64자, 시험 DB의 관리자 OTP 비밀이 이 열쇠로 잠겨서 있던 값 살림)
        ADMIN_TOTP_KEY: current.ADMIN_TOTP_KEY || crypto.randomBytes(32).toString('hex'),
    };
    for (const key of ['TOSS_TEST_SECRET_KEY', 'TOSS_TEST_SECURITY_KEY', 'TOSS_TEST_CLIENT_KEY']) {
        if (backendEnv[key]) env[key] = backendEnv[key];
        else if (current[key]) env[key] = current[key];
    }
    return env;
};

const writeEnv = (env) => {
    const lines = ['# 브라우저 시험 전용 비밀값 (e2e/scripts/setup-db.js가 만듦, git에 안 올라감, 화면·로그에 값 찍지 않기)'];
    for (const [key, value] of Object.entries(env)) lines.push(`${key}=${value}`);
    fs.writeFileSync(ENV_FILE, `${lines.join('\n')}\n`);
};

// SQL은 표준 입력으로 (비번이 명령 줄에 안 남게), root 비번은 컨테이너 안 환경값
const runRootSql = (sql) => {
    const result = spawnSync('docker', ['exec', '-i', CONTAINER, 'sh', '-c', 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'], { input: sql, encoding: 'utf8' });
    const messages = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/)
        .filter((line) => line.trim() && !/Using a password on the command line/.test(line));
    if (result.status !== 0 || messages.length > 0) {
        throw new Error(`시험 DB 만들기 실패: ${messages.join(' | ') || `종료 코드 ${result.status}`}`);
    }
};

// GRANT의 _ 는 아무 글자로 읽혀서 \_ 로 막음 (딱 joker_e2e만)
const grantName = (name) => name.replace(/_/g, '\\_');

const ensureDatabase = (env, reset) => {
    runRootSql(`
${reset ? `DROP DATABASE IF EXISTS \`${DB_NAME}\`;` : ''}
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${env.E2E_DB_PASSWORD}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${env.E2E_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${grantName(DB_NAME)}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
`);
};

// 마이그레이션 + 시험 상품 (백엔드 코드 그대로 씀, DB 주소는 시험 DB로)
const migrateAndSeed = async (env) => {
    process.env.DATABASE_URL = env.DATABASE_URL;
    process.env.NODE_ENV = 'development';
    // 개발 설정은 SQL을 다 찍어서 그 줄만 숨김
    const originalLog = console.log;
    console.log = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('Executing (')) return; originalLog(...args); };
    const db = require(path.join(BACKEND_DIR, 'models'));
    try {
        const migrationRunner = require(path.join(BACKEND_DIR, 'db', 'migrationRunner'));
        const { MIGRATIONS } = require(path.join(BACKEND_DIR, 'scripts', 'migrate-db'));
        const { applied } = await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
        const [[{ name }]] = await db.sequelize.query('SELECT DATABASE() AS name');
        if (name !== DB_NAME) throw new Error(`엉뚱한 DB에 붙음: ${name}`);
        const { seed } = require(path.join(BACKEND_DIR, 'scripts', 'seed-test-currency-products'));
        await seed();
        return { applied: applied.length, total: MIGRATIONS.length };
    } finally {
        await db.sequelize.close();
        console.log = originalLog;
    }
};

const main = async ({ reset = process.argv.includes('--reset'), quiet = false } = {}) => {
    const env = buildEnv(reset);
    writeEnv(env);
    ensureDatabase(env, reset);
    const { applied, total } = await migrateAndSeed(env);
    if (!quiet) console.log(`[e2e] 시험 DB ${DB_NAME} 준비 끝 (마이그레이션 ${total}개 중 이번에 ${applied}개 적용, 시험 상품 넣음)${reset ? ' — 새로 만듦' : ''}`);
    return env;
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`[e2e] ${error.message}`);
        process.exit(1);
    });
}

module.exports = { main, readEnvFile, ENV_FILE, DB_NAME, DB_USER };
