'use strict';

// 이모티콘 팔레트 저장 몸 검사 시험: 진짜 경로(PUT /user/me/emoji-palette)에 몸 보내고 거절·통과와 거절 뒤 팔레트 그대로인지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-240~246 (돌리기: node --env-file=.env.test --test tests/flow/a12-palette-request.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 기본 이모티콘 8개 (누구나 가짐, 팔레트 처음 값)
const BASIC = ['reject', 'tears', 'anger', 'love', 'grin', 'hello', 'surrender', 'dizzy'].map((slug) => `emoji-basic-${slug}`);

// 서버 + 팔레트 읽어 둔 사람 (revision 받음)
const setup = async (t) => {
    const base = await w.startApp(t);
    w.economyDb(t);
    const cookie = w.login(w.uid('a12-palette'));
    const read = () => w.call(base, 'GET', '/user/me/emoji-palette', { cookie });
    const save = (body) => w.call(base, 'PUT', '/user/me/emoji-palette', { cookie, body });
    const first = await read();
    assert.equal(first.status, 200, '준비: 팔레트 읽기');
    return { read, save, revision: first.body.revision, slots: first.body.slots };
};

// 400(+코드) 뒤 다시 읽으면 칸·revision 그대로
const assertRejectedKept = async (c, body, code) => {
    const res = await c.save(body);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    if (code) assert.equal(res.body.code, code);
    const after = await c.read();
    assert.deepEqual(after.body.slots, c.slots, '팔레트 칸이 바뀜');
    assert.equal(after.body.revision, c.revision, 'revision이 바뀜');
};

// 기본 8개 순서를 한 칸 돌린 값 (저장되면 달라 보임)
const rotated = () => [...BASIC.slice(1), BASIC[0]];

test('A12-B-240 팔레트 저장 몸에 모르는 칸 → 400, 팔레트 그대로', async (t) => {
    const c = await setup(t);
    await assertRejectedKept(c, { slots: rotated(), expectedRevision: c.revision, owner: 'someone' }, null);
});

test('A12-B-241 칸 7개 → 400 INVALID_SLOTS, 팔레트 그대로', async (t) => {
    const c = await setup(t);
    await assertRejectedKept(c, { slots: rotated().slice(0, 7), expectedRevision: c.revision }, 'INVALID_SLOTS');
});

test('A12-B-242 칸 9개 → 400 INVALID_SLOTS, 팔레트 그대로', async (t) => {
    const c = await setup(t);
    await assertRejectedKept(c, { slots: [...rotated(), null], expectedRevision: c.revision }, 'INVALID_SLOTS');
});

test('A12-B-243 칸 8개 → 통과 (저장됨)', async (t) => {
    const c = await setup(t);
    const res = await c.save({ slots: rotated(), expectedRevision: c.revision });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const after = await c.read();
    assert.deepEqual(after.body.slots, rotated());
});

test('A12-B-244 expectedRevision 없음 → 400, 팔레트 그대로', async (t) => {
    const c = await setup(t);
    await assertRejectedKept(c, { slots: rotated() }, null);
});

test('A12-B-245 칸에 빈 글자 → 400 INVALID_SLOTS, 팔레트 그대로', async (t) => {
    const c = await setup(t);
    const slots = rotated();
    slots[2] = '';
    await assertRejectedKept(c, { slots, expectedRevision: c.revision }, 'INVALID_SLOTS');
});

test('A12-B-246 칸에 숫자 → 400 INVALID_SLOTS, 팔레트 그대로', async (t) => {
    const c = await setup(t);
    const slots = rotated();
    slots[2] = 3;
    await assertRejectedKept(c, { slots, expectedRevision: c.revision }, 'INVALID_SLOTS');
});
