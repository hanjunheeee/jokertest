'use strict';

// 관리자 화면에 내보내는 IP·이메일 가리기 시험: IP는 앞 두 칸만, 이메일은 a***@gmail.com 모양
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-023~026 (돌리기: node --env-file=.env.test --test)
const test = require('node:test');
const assert = require('node:assert/strict');

const { maskIp } = require('../../admin/services/members/detail');
const { maskEmail } = require('../../utils/auth/maskEmail');

const IP_CASES = [
    ['023', '123.45.67.89', '123.45.*.*'],
    ['024', '::ffff:1.2.3.4', '1.2.*.*'],
    ['025', '2001:db8:1::5', '2001:db8:*'],
];

for (const [no, ip, masked] of IP_CASES) {
    test(`A14-B-${no} IP 가리기 ${ip} → ${masked}`, () => {
        assert.equal(maskIp(ip), masked);
    });
}

// 관리자 회원 목록·상세가 쓰는 가리기 함수 (admin/services/members/search.js·detail.js가 부름)
test('A14-B-026 이메일 가리기 abc@gmail.com → a***@gmail.com', () => {
    assert.equal(maskEmail('abc@gmail.com'), 'a***@gmail.com');
});
