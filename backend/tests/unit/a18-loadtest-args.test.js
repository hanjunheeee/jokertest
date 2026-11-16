'use strict';

// 부하 스크립트 시험 — 판 인원 5~10만, 운영 주소 차단 목록이면 무조건 거부, 운영 환경이면 로컬 DB여도 시험 계정 안 만듦
// 목록 A18-B-209~214 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-loadtest-args.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// run.js가 맨 위에서 backend/.env를 읽음 → 진짜 .env를 안 읽게 읽기 함수를 먼저 비움 (꼭 run.js require보다 먼저)
require('dotenv').config = () => ({ parsed: {} });

const { parseArgs } = require('../../scripts/loadtest/run');
const { checkTargetAllowed, assertLocalDatabase, REMOTE_FLAG } = require('../../scripts/loadtest/target');

// 오류 받기 (안 던지면 null)
const errorOf = (fn) => {
    try { fn(); return null; } catch (error) { return error; }
};

// ── 209~212: --players 5~10 ──
[
    ['209', 4, false],
    ['210', 5, true],
    ['211', 10, true],
    ['212', 11, false],
].forEach(([no, players, ok]) => {
    test(`A18-B-${no} --players ${players} → ${ok ? '됨' : '오류 "--players는 5~10"'}`, () => {
        const error = errorOf(() => parseArgs(['--players', String(players)]));
        if (ok) {
            assert.equal(error, null, error?.message);
            assert.equal(parseArgs(['--players', String(players)]).players, players);
        } else {
            assert.ok(error, '오류가 안 남');
            assert.match(error.message, /--players는 5~10/);
        }
    });
});

test('A18-B-213 대상이 차단 목록과 같은 호스트 + 원격 깃발·계정 파일 다 줌 → 거부', () => {
    assert.equal(REMOTE_FLAG.startsWith('--'), true);
    const error = errorOf(() => checkTargetAllowed({
        target: 'https://api.mmc.example.test',
        allowRemote: true,
        accountsFile: 'fake-a18-accounts.json',
        blocked: 'https://mmc.example.test,api.mmc.example.test',
    }));
    assert.ok(error, '운영 주소인데 통과함');
    assert.match(error.message, /거부/);
});

test('A18-B-214 NODE_ENV=production → DB 주소가 localhost여도 시험 계정 만들기 거부', () => {
    const error = errorOf(() => assertLocalDatabase('mysql://fakeuser:fakepass@localhost:3306/fake_loadtest_db', 'production'));
    assert.ok(error, '운영인데 통과함');
});
