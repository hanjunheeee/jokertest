'use strict';

// 관리자 판 골드 값 시험: 바꾸면 기록 "판 골드 바꿈"·경계 값 기록·서버별 반영 결과·처리 이력 맨 위 줄 (진짜 관리자 경로 + 시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-277~280 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a14-ops-helpers');
const gameSettings = require('../../services/ops/gameSettings');

const { db } = H;
const KEY = 'GAME_GOLD_REWARD';
const PATH = '/admin-api/game-settings';
const ctx = H.useAdminFile();

const put = (goldReward) => ctx.app.agent.request('PUT', PATH, { body: { goldReward } });
const goldAudits = () => H.myAudits(ctx.app.admin, { action: 'GAME_SETTING_UPDATE', targetId: KEY });

// 시험마다 표 값을 정하고 끝에 처음 값으로 되돌림 (판 골드는 공용 설정 줄이라 잠금 쥔 동안만 바뀌어 있게)
async function startAt(t, value) {
    const original = await db.GameSetting.findOne({ where: { key: KEY }, raw: true });
    const [row] = await db.GameSetting.findOrCreate({ where: { key: KEY }, defaults: { key: KEY, value_int: value } });
    await row.update({ value_int: value });
    gameSettings.__setGoldRewardForTests(value);
    t.after(async () => {
        if (original) await db.GameSetting.update({ value_int: original.value_int, updated_by: original.updated_by }, { where: { key: KEY } });
        else await db.GameSetting.destroy({ where: { key: KEY } });
        gameSettings.__setGoldRewardForTests();
    });
}

test('A14-B-277 판 골드 1 → 2 → 기록 GAME_SETTING_UPDATE 1줄, before 1·after 2·대상 GAME_GOLD_REWARD·누가 = 관리자', async (t) => {
    if (H.noDb(t)) return;
    await startAt(t, 1);
    const before = (await goldAudits()).length;
    const res = await put(2);
    assert.equal(res.status, 200);
    const rows = await goldAudits();
    assert.equal(rows.length, before + 1);
    const last = rows.at(-1);
    assert.deepEqual(last.before_value, { goldReward: 1 });
    assert.deepEqual(last.after_value, { goldReward: 2 });
    assert.equal(last.target_id, KEY);
    assert.equal(last.admin_id, ctx.app.admin.id);
});

test('A14-B-278 경계: 0·100은 기록 1줄씩, −1·101은 400·기록 0줄', async (t) => {
    if (H.noDb(t)) return;
    await startAt(t, 5);
    for (const [value, ok] of [[0, true], [100, true], [-1, false], [101, false]]) {
        const before = (await goldAudits()).length;
        const res = await put(value);
        if (ok) {
            assert.equal(res.status, 200, `${value} 상태`);
            assert.equal((await goldAudits()).length, before + 1, `${value} 기록 1줄`);
        } else {
            H.assertInvalid(res, 'goldReward');
            assert.equal((await goldAudits()).length, before, `${value} 기록 0줄`);
        }
    }
});

test('A14-B-279 메모리 서버 둘: 둘 다 받으면 nodes 2줄 ok·partial false / ㄴ 답 없으면 ㄴ ok:false·partial true, 값은 저장', async (t) => {
    if (H.noDb(t)) return;
    await startAt(t, 1);
    // ㄱ: 둘 다 받음
    const both = await H.startTwoNodes(t, { answers: true });
    const res = await put(3);
    assert.equal(res.status, 200);
    const byNode = new Map(res.body.nodes.map((n) => [n.node, n]));
    assert.equal(res.body.nodes.length, 2);
    assert.equal(byNode.get(both.selfId)?.ok, true);
    assert.equal(byNode.get(both.otherId)?.ok, true);
    assert.equal(res.body.partial, false);
    // ㄴ: 새 서버 둘로 바꿔 ㄴ이 답 안 함 (앞 묶음은 새로 켤 때 닫힘)
    const silent = await H.startTwoNodes(t, { answers: false });
    const late = await put(4);
    assert.equal(late.status, 200);
    const lateByNode = new Map(late.body.nodes.map((n) => [n.node, n]));
    assert.equal(lateByNode.get(silent.selfId)?.ok, true);
    assert.equal(lateByNode.get(silent.otherId)?.ok, false);
    assert.equal(typeof lateByNode.get(silent.otherId)?.code, 'string');
    assert.equal(late.body.partial, true);
    assert.equal((await db.GameSetting.findOne({ where: { key: KEY }, raw: true })).value_int, 4, '값은 저장됨');
});

test('A14-B-280 바꾼 뒤 GET /audit-logs?kind=all 맨 위 줄 = GAME_SETTING_UPDATE, 누가 = 바꾼 관리자', async (t) => {
    if (H.noDb(t)) return;
    await startAt(t, 1);
    assert.equal((await put(6)).status, 200);
    const res = await ctx.app.agent.get('/admin-api/audit-logs?kind=all');
    assert.equal(res.status, 200);
    const [top] = res.body.items;
    assert.equal(top.action, 'GAME_SETTING_UPDATE');
    assert.equal(top.admin.id, ctx.app.admin.id);
    assert.equal(top.admin.loginId, ctx.app.admin.loginId);
});
