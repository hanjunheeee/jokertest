'use strict';

// 관리자 OTP 비밀 잠그기·풀기 시험: 같은 열쇠면 원래 값, 모양 v1:<iv>:<tag>:<암호문>, 다른 열쇠·고친 암호문이면 못 풂
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-012~015 (돌리기: node --env-file=.env.test --test)
const test = require('node:test');
const assert = require('node:assert/strict');

const secretBox = require('../../admin/services/core/secretBox');

// 누가 봐도 가짜인 열쇠 둘 (32바이트)
const KEY = Buffer.from('ab'.repeat(32), 'hex');
const OTHER_KEY = Buffer.from('cd'.repeat(32), 'hex');
const PLAIN = 'A14GATEFAKEOTPSEEDNOTREAL2345';

test('A14-B-012 잠근 뒤 같은 열쇠로 풂 → 원래 값', () => {
    assert.equal(secretBox.open(secretBox.seal(PLAIN, KEY), KEY), PLAIN);
});

test('A14-B-013 잠근 모양 → v1:<iv>:<tag>:<암호문> (base64url 네 칸)', () => {
    const sealed = secretBox.seal(PLAIN, KEY);
    assert.match(sealed, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    assert.ok(!sealed.includes(PLAIN), '원문이 그대로 안 보임');
});

test('A14-B-014 다른 열쇠로 풂 → 실패', () => {
    const sealed = secretBox.seal(PLAIN, KEY);
    assert.throws(() => secretBox.open(sealed, OTHER_KEY));
});

test('A14-B-015 암호문 한 글자 고침 → 실패', () => {
    const sealed = secretBox.seal(PLAIN, KEY);
    const parts = sealed.split(':');
    // 암호문 첫 글자를 다른 글자로 (첫 바이트 위쪽 비트가 바뀜)
    const body = parts[3];
    parts[3] = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
    assert.throws(() => secretBox.open(parts.join(':'), KEY));
});
