'use strict';

// 판 골드 값 서버 한 대 시험: Redis 없이(단일 모드) 관리자가 값을 바꾸면 응답의 서버별 반영 결과가 하나이고 일부만 됨이 아님
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-300, 돌리기: node --env-file=.env.test --test tests/cluster/a07-gold-reload.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const cluster = require('../../cluster');
const gameSettings = require('../../services/ops/gameSettings');
const reloadSync = require('../../services/ops/reloadSync');
const manage = require('../../admin/services/gameSettings/manage');

const KEY = 'GAME_GOLD_REWARD';

// 판 설정 표 대신 메모리 표 (DB 없이 도는 시험, 바꾸기·다시 읽기 둘 다 이 표를 봄)
function memoryTable(start) {
    const rows = new Map([[KEY, { key: KEY, value_int: start, updated_at: new Date(0), updated_by: null }]]);
    const asRow = (row) => ({ ...row, update: async (changes) => { Object.assign(rows.get(row.key), changes); } });
    return {
        rows,
        sequelize: { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }) },
        GameSetting: {
            findAll: async () => [...rows.values()].map(asRow),
            findOne: async ({ where }) => (rows.has(where.key) ? asRow(rows.get(where.key)) : null),
            create: async (row) => { rows.set(row.key, { ...row }); return asRow(row); },
        },
        AdminAuditLog: { create: async () => ({ id: 1 }) },
    };
}

test('A07-B-300 (Redis 없음) 바꿈 → 응답 nodes 1개·partial false', async (t) => {
    assert.equal(cluster.isEnabled(), false, '서버 한 대(단일 모드)여야 함');
    const table = memoryTable(1);
    // 다시 읽기도 같은 메모리 표에서 (진짜 다시 읽기 함수, 읽는 곳만 바꿈)
    const original = gameSettings.reloadGameSettings;
    t.mock.method(gameSettings, 'reloadGameSettings', () => original({ db: table }));
    gameSettings.__setGoldRewardForTests(1);
    t.after(() => {
        gameSettings.__setGoldRewardForTests();
        reloadSync.__testables.stopSafetyNet();
    });
    const result = await manage.updateGameSettings({ req: { admin: { id: 'admin-a07' } }, goldReward: 3 }, { db: table });
    assert.equal(result.settings.goldReward, 3);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].node, cluster.serverId());
    assert.equal(result.nodes[0].ok, true);
    assert.equal(result.partial, false);
    // 이 서버 값도 새 값
    assert.equal(gameSettings.getGameSettingsState().goldReward, 3);
});
