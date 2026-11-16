'use strict';

// 운영이면 시험 손잡이 길이 없는지 시험 — 운영 + E2E_HOOKS=1 + 맞는 열쇠여도 /e2e 길 둘 다 404
// 목록 A18-B-122 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/flow/a18-e2e-router.test.js
// 모델이 DB에 안 붙게 닿지 않는 주소 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');

const { createE2eRouter } = require('../../routes/e2e.routes');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

test('A18-B-122 운영 + E2E_HOOKS=1 + 맞는 X-Internal-Key → POST /e2e/games/x/advance·GET /e2e/users/u/game 둘 다 404', async (t) => {
    // 시험 안에서만 쓰는 가짜 열쇠 (32자 넘게)
    const key = `fake-a18-internal-${crypto.randomBytes(16).toString('hex')}`;
    const env = { NODE_ENV: 'production', E2E_HOOKS: '1', INTERNAL_API_KEY: key };
    // 시작 파일처럼: 길 붙이고 → 없는 길 404 → 오류 처리
    const app = express();
    app.use(express.json());
    app.use('/e2e', createE2eRouter({ env }));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const headers = { 'X-Internal-Key': key, 'Content-Type': 'application/json' };
    const advance = await fetch(`${url}/e2e/games/x/advance`, { method: 'POST', headers, body: '{}' });
    const game = await fetch(`${url}/e2e/users/u/game`, { headers });
    // 손잡이 길이 받았으면 "판 없음" 404 + 저장 금지 머리가 붙음 → 둘 다 없어야 "길 자체 없음"
    for (const res of [advance, game]) {
        assert.equal(res.status, 404);
        assert.notEqual(res.headers.get('cache-control'), 'no-store', '손잡이 길이 요청을 받음');
        assert.doesNotMatch(await res.text(), /NO_GAME/);
    }
});
