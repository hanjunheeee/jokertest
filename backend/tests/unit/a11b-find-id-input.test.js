'use strict';

// 아이디 찾기 입력 검사 시험 — 닉네임 2자부터(가입 8자 제한 안 씀)·글자 종류·다듬기, 생일 YYYY-MM-DD·없는 날·미래 거절
// 목록 A11-B-527~536 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), DB 안 씀
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateFindIdPayload } = require('../../validations/auth/findId');

// 맞는 본문 (칸 하나만 바꿔 봄)
const BASE = Object.freeze({ nickname: '가면쓴이', birthDate: '2000-01-01' });

// 내일 날짜 (UTC 기준, 서버 비교와 같은 날짜 기준)
function tomorrowUtc() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return next.toISOString().slice(0, 10);
}

// [번호, 이름, 바꿀 칸, 통과해야 하나, 통과면 다듬은 닉네임]
const CASES = [
    ['A11-B-527', '닉네임 1자 → 거절', { nickname: '가' }, false],
    ['A11-B-528', '닉네임 2자 → 통과', { nickname: '가면' }, true, '가면'],
    ['A11-B-529', '닉네임 9자 → 통과 (가입 8자 제한 안 씀)', { nickname: '가면무도회살인사건' }, true, '가면무도회살인사건'],
    ['A11-B-530', '닉네임 ab! → 거절', { nickname: 'ab!' }, false],
    ['A11-B-531', '앞뒤 빈칸 → 다듬어 통과', { nickname: '  가면쓴이  ' }, true, '가면쓴이'],
    ['A11-B-532', '생일 2000-01-01 → 통과', { birthDate: '2000-01-01' }, true, '가면쓴이'],
    ['A11-B-533', '생일 2000-13-01 → 거절', { birthDate: '2000-13-01' }, false],
    ['A11-B-534', '생일 20000101 → 거절', { birthDate: '20000101' }, false],
    ['A11-B-535', '생일 내일 → 거절', { birthDate: tomorrowUtc() }, false],
    ['A11-B-536', '생일 숫자 값 → 거절', { birthDate: 20000101 }, false],
];

for (const [id, name, change, pass, nickname] of CASES) {
    test(`${id} 아이디 찾기 입력: ${name}`, () => {
        const result = validateFindIdPayload({ ...BASE, ...change });
        assert.equal(result.ok, pass);
        if (pass) {
            assert.equal(result.value.nickname, nickname);
            // 생일은 그날 UTC 0시
            assert.equal(result.value.birthDate.toISOString(), '2000-01-01T00:00:00.000Z');
        }
        // 미래 생일은 가입과 같은 문구
        if (id === 'A11-B-535') assert.equal(result.message, '생년월일은 미래일 수 없습니다.');
    });
}
