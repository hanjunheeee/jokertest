'use strict';

// 친구 찾기 DB 시험 — 차단한 사이는 안 나옴(양쪽), 검색어 % · _ 는 글자 그대로
// 목록 A13-B-324~327 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-friend-search.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createUser, login, block, nicknameOf } = W;
const noDb = W.useTestDb(test);

const search = (call, cookie, q) => call('GET', `/friends/search?q=${encodeURIComponent(q)}`, { cookie });

for (const [no, label, mine] of [['A13-B-324', '내가 차단한 사람', true], ['A13-B-325', '나를 차단한 사람', false]]) {
    test(`${no} ${label} 닉네임으로 검색 → 결과에 없음`, async (t) => {
        if (noDb(t)) return;
        const call = await W.startServer(t);
        const me = await createUser('me');
        const other = await createUser('blk');
        if (mine) await block(me, other);
        else await block(other, me);
        const res = await search(call, await login(me), await nicknameOf(other));
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.data.some((u) => u.id === other), false);
    });
}

// A13-B-326~327 특수 글자 하나를 넣은 닉네임과 안 넣은 닉네임 → 그 글자로 찾으면 넣은 쪽만
for (const [no, mark] of [['A13-B-326', '%'], ['A13-B-327', '_']]) {
    test(`${no} 검색어 "${mark}" → 그 글자가 든 닉네임만(아무 글자나 맞는 것으로 안 봄)`, async (t) => {
        if (noDb(t)) return;
        const call = await W.startServer(t);
        const me = await createUser('me');
        const tag = crypto.randomUUID().slice(0, 6);
        const withMark = await createUser('wm', { nickname: `a13${mark}${tag}` });
        const without = await createUser('wo', { nickname: `a13x${tag}` });
        const res = await search(call, await login(me), mark);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const names = res.body.data.map((u) => u.name);
        assert.ok(names.every((name) => name.includes(mark)), `글자 없는 닉네임이 나옴: ${names.join(',')}`);
        assert.ok(res.body.data.some((u) => u.id === withMark), '든 닉네임이 안 나옴');
        assert.equal(res.body.data.some((u) => u.id === without), false);
    });
}
