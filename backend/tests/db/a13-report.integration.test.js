'use strict';

// 신고 보내기·겹침 막기 DB 시험 — 판 중 접수, 끝나고 지운 판은 저장된 결과로 확인, 같이 한 판 아님, 같은 판 같은 대상 한 번, 다른 대상·다른 판은 따로, 동시에 둘
// 목록 A13-B-391~398 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 채팅 증거는 A06 몫
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-report.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const { db, createUser, createUsers, callController } = W;
const playerOpsController = require('../../controllers/ops/player');
const { getSessionById } = require('../../game-core/queries/byId');
// 판 세상은 models 다음에 (A08 것을 읽기만 해서 씀)
const { makeWorld } = require('../flow/a08-world');

// 판 끝 저장이 끝날 틈 (닫힌 연결에 쓰다 오류 찍히는 것 막기)
async function waitReal(ms) {
    const until = performance.now() + ms;
    while (performance.now() < until) await new Promise((resolve) => setImmediate(resolve));
}
const noDb = W.useTestDb(test, { beforeClose: () => waitReal(500) });

// n명 판 열기 (판 사람은 DB 사람), realDb면 판 저장도 진짜
async function openGame(t, n, { realDb = false, w = null } = {}) {
    const world = w ?? makeWorld(t, { now: Math.floor(Date.now() / 1000) * 1000, realDb });
    const uuids = await createUsers(n, `g${n}`);
    const g = await world.openAndStart({ uuids, n });
    return { w: world, g, uuids };
}
// 신고 하나 (POST /reports 처리기) → { status, body }
const report = (reporterId, body) => callController(playerOpsController.submitReport, { user: { uuid: reporterId }, body });
const reportsBy = (reporter) => db.Report.findAll({ where: { reporter_id: reporter }, raw: true });
const body = (targetUuid, gameId, reasonCode = 'ABUSE', memo) => ({ targetUuid, gameId, reasonCode, ...(memo === undefined ? {} : { memo }) });

test('A13-B-391 6명 판 중 같은 판 사람 신고 → reports 1줄 OPEN·사유·메모, 201 { ok: true, reportId }', async (t) => {
    if (noDb(t)) return;
    const { g, uuids } = await openGame(t, 6);
    const res = await report(uuids[0], body(uuids[1], g.gameId, 'ABUSE', '욕을 함'));
    assert.equal(res.status, 201, res.body?.message);
    assert.equal(res.body.ok, true);
    const rows = await reportsBy(uuids[0]);
    assert.equal(rows.length, 1);
    assert.equal(String(res.body.reportId), String(rows[0].id));
    assert.equal(rows[0].status, 'OPEN');
    assert.equal(rows[0].reason_code, 'ABUSE');
    assert.equal(rows[0].memo, '욕을 함');
});

test('A13-B-392 7명 판 끝·메모리 판 지운 뒤 신고 → 저장된 판 결과로 확인해 접수', async (t) => {
    if (noDb(t)) return;
    const { w, g, uuids } = await openGame(t, 7, { realDb: true });
    await w.endGame(g);
    w.tickToSinceEnd(g, 180_000);
    await w.flush();
    // 판 결과 줄이 저장될 때까지 진짜 시간으로 기다림
    const until = performance.now() + 10_000;
    while (performance.now() < until && (await db.GameResultPlayer.count({ where: { game_id: g.gameId } })) < 7) await waitReal(20);
    assert.equal(await db.GameResultPlayer.count({ where: { game_id: g.gameId } }), 7, '판 결과 저장 안 됨 (준비 잘못)');
    assert.equal(getSessionById(g.gameId) ?? null, null, '메모리 판이 안 지워짐 (준비 잘못)');
    const res = await report(uuids[0], body(uuids[1], g.gameId, 'GRIEFING'));
    assert.equal(res.status, 201, res.body?.message);
    assert.equal((await reportsBy(uuids[0])).length, 1);
});

for (const [no, label, outsiderIsTarget] of [['A13-B-393', '대상이 그 판에 없음', true], ['A13-B-394', '신고한 사람이 그 판에 없음', false]]) {
    test(`${no} 8명 판: ${label} → 404 GAME_NOT_FOUND "같이 한 판을 찾을 수 없습니다.", 0줄`, async (t) => {
        if (noDb(t)) return;
        const { g, uuids } = await openGame(t, 8);
        const outsider = await createUser('out');
        const [reporter, target] = outsiderIsTarget ? [uuids[0], outsider] : [outsider, uuids[0]];
        const res = await report(reporter, body(target, g.gameId));
        assert.equal(res.status, 404);
        assert.equal(res.body.code, 'GAME_NOT_FOUND');
        assert.equal(res.body.message, '같이 한 판을 찾을 수 없습니다.');
        assert.equal((await reportsBy(reporter)).length, 0);
    });
}

test('A13-B-395 5명 판 같은 대상 ABUSE 뒤 CHEATING → 409 DUPLICATE_REPORT "이미 신고한 대상입니다.", 1줄', async (t) => {
    if (noDb(t)) return;
    const { g, uuids } = await openGame(t, 5);
    assert.equal((await report(uuids[0], body(uuids[1], g.gameId, 'ABUSE'))).status, 201);
    const res = await report(uuids[0], body(uuids[1], g.gameId, 'CHEATING'));
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'DUPLICATE_REPORT');
    assert.equal(res.body.message, '이미 신고한 대상입니다.');
    assert.equal((await reportsBy(uuids[0])).length, 1);
});

test('A13-B-396 10명 판 같은 판 다른 사람 신고 → 접수, 2줄', async (t) => {
    if (noDb(t)) return;
    const { g, uuids } = await openGame(t, 10);
    assert.equal((await report(uuids[0], body(uuids[1], g.gameId))).status, 201);
    assert.equal((await report(uuids[0], body(uuids[2], g.gameId))).status, 201);
    assert.equal((await reportsBy(uuids[0])).length, 2);
});

test('A13-B-397 5명 판 → 6명 판 두 판에서 같은 사람 신고 → 둘 다 접수', async (t) => {
    if (noDb(t)) return;
    const first = await openGame(t, 5);
    const [reporter, target] = first.uuids;
    assert.equal((await report(reporter, body(target, first.g.gameId))).status, 201);
    await first.w.endGame(first.g);
    first.w.tickToSinceEnd(first.g, 180_000);
    await first.w.flush();
    // 같은 두 사람 + 새 사람 4명으로 둘째 판
    const others = await createUsers(4, 'g2');
    const second = await first.w.openAndStart({ uuids: [reporter, target, ...others], n: 6 });
    const res = await report(reporter, body(target, second.gameId));
    assert.equal(res.status, 201, res.body?.message);
    assert.equal((await reportsBy(reporter)).length, 2);
});

test('A13-B-398 6명 판 같은 신고를 동시에 두 번 → 1줄, 하나는 409 DUPLICATE_REPORT', async (t) => {
    if (noDb(t)) return;
    const { g, uuids } = await openGame(t, 6);
    const answers = await Promise.all([1, 2].map(() => report(uuids[0], body(uuids[1], g.gameId))));
    assert.deepEqual(answers.map((a) => a.status).sort(), [201, 409]);
    assert.equal(answers.find((a) => a.status === 409).body.code, 'DUPLICATE_REPORT');
    assert.equal((await reportsBy(uuids[0])).length, 1);
});
