'use strict';

// A09 탈주 DB 시험 공용 준비 (a09-desertion-record·a09-desertion-restart DB 시험만 씀)
// 시험 DB 비우고 마이그레이션 올리기 + 진짜 계정 만들기 + 진짜 계정·uuid 판 id로 판 열기 + 탈주 줄 읽기
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 시험에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
// 모델을 먼저 불러 시험 DB에 붙여 둠 (판 도우미가 DATABASE_URL을 막는 값으로 바꾸기 전에)
const db = require('../../models');
const h = require('../flow/a09-leave-harness');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

// 파일 처음에 한 번: 시험 DB 비우고 마이그레이션 끝까지
async function prepareDb() {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
}

// 시험마다 새 사람 n명 (계정 + 통계 한 줄), uuid가 달라 시험끼리 안 섞임
async function createUsers(n, label) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `${label}${i}${uuid.slice(0, 4)}`.slice(0, 12),
            email: `${label}-${i}-${uuid}@example.test`,
        });
        await db.UserStats.create({ user_id: uuid });
        uuids.push(uuid);
    }
    return uuids;
}

// 진짜 계정으로 판 열기 (uuid 판 id, 직업 고정), 이미 만든 계정을 섞으려면 uuids로
async function openDbGame(w, { n, label, uuids, roleCounts, code } = {}) {
    const ids = uuids ?? await createUsers(n, label);
    return w.openGame({ uuids: ids, roleCounts, code, gameId: crypto.randomUUID() });
}

// 그 사람(+판) 탈주 줄
const desertionRows = (userId, gameId) => db.GameDesertion.findAll({
    where: gameId ? { user_id: userId, game_id: gameId } : { user_id: userId },
    order: [['id', 'ASC']],
    raw: true,
});

// 탈주 줄 쓰기는 안 기다리는 길 → 진짜 시계로 잠깐씩 다시 봄 (Date를 가짜로 둔 시험이라 횟수로 셈)
async function waitFor(check, label, tries = 150) {
    for (let i = 0; i < tries; i += 1) {
        if (await check()) return;
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`${label} 기다리다 시간 넘김`);
}

// 줄이 생길 수 있는 비동기 꼬리를 흘려보냄 (0줄을 볼 때)
async function settle() {
    for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

// 산 사람 끊김: 소켓 끊고 60초 기다림을 따로 만든 가짜 시계로 걸어 둠 (진짜 60초 안 기다림)
function disconnectWithClock(w, session, uuid) {
    const clock = h.gf.fakeClock();
    w.sock(uuid).connected = false;
    h.T.beginDisconnectGrace(w.io, session, uuid, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
    });
    return clock;
}

// 직접 넣는 탈주 줄 (시각은 ms)
const insertRow = ({ userId, gameId = crypto.randomUUID(), reason = 'LEFT_ALIVE', desertedAt, blockedUntil }) => db.GameDesertion.create({
    user_id: userId, game_id: gameId, reason, deserted_at: new Date(desertedAt), blocked_until: new Date(blockedUntil),
});

module.exports = {
    TEST_DB_URL,
    db,
    h,
    noDb,
    prepareDb,
    createUsers,
    openDbGame,
    desertionRows,
    waitFor,
    settle,
    disconnectWithClock,
    insertRow,
};
