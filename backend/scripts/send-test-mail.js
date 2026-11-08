#!/usr/bin/env node
'use strict';

// 메일 설정 확인 파일, 받는 주소 하나에 가입 인증번호 모양 시험 메일 한 통 보내고 성공/실패만 찍음
// 개발자가 직접 돌림 (node --env-file=.env scripts/send-test-mail.js 받는주소), 설정 값·실패 원인은 안 찍음
const crypto = require('crypto');
const mail = require('../utils/adapters/mail');

const main = async () => {
    const to = process.argv[2];
    if (!to || !to.includes('@')) {
        console.error('받는 주소를 넣어 주세요: node --env-file=.env scripts/send-test-mail.js 받는주소');
        process.exitCode = 1;
        return;
    }
    // 시험용 무작위 숫자 (실제 가입엔 못 씀)
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const result = await mail.createHttpMailAdapter().sendMail({ to, template: 'SIGNUP_CODE', params: { code, expiresInSec: 600 } });
    console.log(`발송기: ${mail.pickSender() === 'smtp' ? 'SMTP' : 'HTTPS 게이트웨이'} / 결과: ${result.ok ? '보냄' : '실패'}`);
    if (!result.ok) process.exitCode = 1;
};

main();
