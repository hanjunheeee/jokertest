'use strict';

// 이메일 칸은 받는 사람 하나만 시험 — 보통 주소·@ 앞 64자는 받고, 여러 곳·끼워 넣기 모양·너무 긴 주소는 거절
// 목록 A15-B-022~031 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-email-address.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { isSingleEmailAddress } = require('../../utils/auth/emailAddress');

// 도메인 칸 63자 넘지 않게 나눈 긴 주소 만들기 → 전체 길이 맞춤
const longAddress = (localLength, totalLength) => {
    const local = 'a'.repeat(localLength);
    const domainLength = totalLength - localLength - 1;
    const tail = '.com';
    let rest = domainLength - tail.length;
    const labels = [];
    while (rest > 0) {
        // 칸 하나 최대 63자, 칸 사이 점 1자
        const size = Math.min(63, rest - (rest > 63 ? 1 : 0));
        labels.push('b'.repeat(size));
        rest -= size + (rest > size ? 1 : 0);
    }
    const address = `${local}@${labels.join('.')}${tail}`;
    assert.equal(address.length, totalLength, '시험 준비: 주소 길이가 안 맞음');
    return address;
};

const ACCEPT = [
    ['A15-B-022', '보통 주소', 'player@a15-mail.test'],
    ['A15-B-023', '@ 앞 64자', `${'a'.repeat(64)}@a15-mail.test`],
];
for (const [id, label, value] of ACCEPT) {
    test(`${id} ${label} → 받음`, () => {
        assert.equal(isSingleEmailAddress(value), true);
    });
}

const REJECT = [
    ['A15-B-024', '쉼표로 이은 두 주소', 'one@a15-mail.test,two@a15-mail.test'],
    ['A15-B-025', '세미콜론', 'one@a15-mail.test;two@a15-mail.test'],
    ['A15-B-026', '<…> 꼴', 'Name <one@a15-mail.test>'],
    ['A15-B-027', '가운데 빈칸', 'one two@a15-mail.test'],
    ['A15-B-028', '끝 줄바꿈', 'one@a15-mail.test\n'],
    ['A15-B-029', '@ 두 개', 'one@two@a15-mail.test'],
    ['A15-B-030', '@ 앞 65자', `${'a'.repeat(65)}@a15-mail.test`],
    ['A15-B-031', '전체 255자', () => longAddress(64, 255)],
];
for (const [id, label, value] of REJECT) {
    test(`${id} ${label} → 거절`, () => {
        const address = typeof value === 'function' ? value() : value;
        assert.equal(isSingleEmailAddress(address), false);
    });
}
