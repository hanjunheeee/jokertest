'use strict';

// 2026-11-09 부하 시험 도구 시험: 대상 주소 거부 규칙 · 숫자 계산 · 설정값 읽기 · 계정 파일 (DB·서버 안 씀)
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');

const { checkTargetAllowed, assertLocalDatabase, parseBlockedList, REMOTE_FLAG } = require('../../scripts/loadtest/target');
const { Stats, summarize } = require('../../scripts/loadtest/stats');
const { parseArgs } = require('../../scripts/loadtest/run');
const { loadAccountsFile, emailOf } = require('../../scripts/loadtest/accounts');

test('부하 대상: 로컬은 그냥 통과, 로컬 아니면 깃발+계정 파일 둘 다 있어야', () => {
    assert.deepEqual(checkTargetAllowed({ target: 'http://127.0.0.1:4000/' }), { origin: 'http://127.0.0.1:4000', local: true });
    assert.equal(checkTargetAllowed({ target: 'http://localhost:4711' }).local, true);

    assert.throws(() => checkTargetAllowed({ target: 'https://staging.example.com' }), new RegExp(REMOTE_FLAG));
    assert.throws(() => checkTargetAllowed({ target: 'https://staging.example.com', allowRemote: true }), /--accounts/);
    assert.deepEqual(
        checkTargetAllowed({ target: 'https://staging.example.com', allowRemote: true, accountsFile: 'a.json' }),
        { origin: 'https://staging.example.com', local: false },
    );
    assert.throws(() => checkTargetAllowed({ target: 'ftp://x' }), /http/);
});

test('부하 대상: 운영 주소 목록에 있으면 깃발이 있어도 거부', () => {
    assert.deepEqual(parseBlockedList(' https://mmc.example.com , api.mmc.example.com,'), ['mmc.example.com', 'api.mmc.example.com']);
    assert.throws(() => checkTargetAllowed({
        target: 'https://API.mmc.example.com/x', allowRemote: true, accountsFile: 'a.json',
        blocked: 'https://mmc.example.com,api.mmc.example.com',
    }), /운영 주소 목록/);
});

test('부하 계정: 로컬 DB·운영 아님일 때만 만듦', () => {
    assert.doesNotThrow(() => assertLocalDatabase('mysql://u:p@localhost:3306/joker', 'development'));
    assert.doesNotThrow(() => assertLocalDatabase('mysql://u:p@127.0.0.1:3306/joker', undefined));
    assert.throws(() => assertLocalDatabase('mysql://u:p@db.example.com:3306/joker', 'development'), /로컬 DB/);
    assert.throws(() => assertLocalDatabase('mysql://u:p@localhost:3306/joker', 'production'), /production/);
    assert.equal(emailOf(3), 'loadtest+3@example.test');
});

test('부하 숫자: 평균·95%·최대, 오류율은 서버 오류만 (규칙 거절 빼고)', () => {
    assert.deepEqual(summarize([]), { count: 0, mean: 0, p95: 0, max: 0 });
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.deepEqual(summarize(values), { count: 100, mean: 50.5, p95: 95, max: 100 });

    const stats = new Stats();
    for (let i = 0; i < 98; i += 1) stats.latency('cast_day_vote', 10);
    stats.error('cast_day_vote:timeout');
    stats.error('socket:connect_error');
    stats.rejection('cast_day_vote:VOTE_CLOSED');
    stats.connectOk = 9;
    stats.connectFail = 1;
    const summary = stats.summary();
    assert.equal(summary.requests, 100);
    assert.equal(summary.errorRate, 0.02);
    assert.deepEqual(summary.rejections, { 'cast_day_vote:VOTE_CLOSED': 1 });
    assert.equal(summary.connect.rate, 0.9);
    assert.equal(summary.byEvent.cast_day_vote.count, 98);
});

test('부하 설정값: 기본값·숫자 변환·단계 목록·틀린 값 거부', () => {
    const base = parseArgs([]);
    assert.equal(base.games, 2);
    assert.equal(base.players, 5);
    assert.equal(base.allowRemote, false);

    const step = parseArgs(['--mode', 'step', '--stages=1,5,x,10', '--hold-min', '0.5', REMOTE_FLAG]);
    assert.deepEqual(step.stageList, [1, 5, 10]);
    assert.equal(step.holdMin, 0.5);
    assert.equal(step.allowRemote, true);

    assert.throws(() => parseArgs(['--players', '3']), /4~10/);
    assert.throws(() => parseArgs(['--nope', '1']), /모르는 설정/);
    assert.throws(() => parseArgs(['--games', 'abc']), /숫자/);
    assert.throws(() => parseArgs(['--mode', 'burst']), /fixed 또는 step/);
});

test('부하 계정 파일: [{email,password}] 배열만 받음', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-lt-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const good = path.join(dir, 'ok.json');
    fs.writeFileSync(good, JSON.stringify([{ email: 'a@x.test', password: 'pw', extra: 1 }]));
    assert.deepEqual(loadAccountsFile(good), [{ email: 'a@x.test', password: 'pw' }]);

    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify([{ email: 'a@x.test' }]));
    assert.throws(() => loadAccountsFile(bad), /0번째/);
    fs.writeFileSync(bad, '[]');
    assert.throws(() => loadAccountsFile(bad), /배열/);
});
