'use strict';

// 메일 보내기 입구 파일, 설정 보고 진짜 발송기 고르기 (시험 파일 받는 곳 → MAIL_SMTP_HOST 있으면 SMTP → 없으면 HTTPS 게이트웨이)
// 비번 재설정 요청·가입 인증번호 요청 서비스가 createHttpMailAdapter로 만들어 씀 (시험은 이 이름을 메모리 발송기로 바꿔 끼움)
const { TEMPLATES, renderTemplate } = require('./mailSenders/templates');
const { createGatewayMailAdapter } = require('./mailSenders/gateway');
const { createSmtpMailAdapter } = require('./mailSenders/smtp');
const { createMemoryMailAdapter } = require('./mailSenders/memory');
const { createFileOutboxMailAdapter } = require('./mailSenders/fileOutbox');
const { getMailTestOutboxDir } = require('../../config/e2eHooks');

// 어느 발송기를 쓸지 (브라우저 시험 파일 받는 곳 먼저 — 운영이면 늘 빠짐, 그다음 SMTP 주소 있으면 SMTP)
const pickSender = (env = process.env) => {
    if (getMailTestOutboxDir(env)) return 'file';
    return typeof env.MAIL_SMTP_HOST === 'string' && env.MAIL_SMTP_HOST.trim() ? 'smtp' : 'gateway';
};

// 진짜 발송기 만들기 (이름은 예전 그대로 둠, 서비스·시험이 이 이름을 씀), 넘긴 설정은 고른 발송기에 그대로
const createHttpMailAdapter = (options = {}) => {
    const sender = pickSender();
    if (sender === 'file') return createFileOutboxMailAdapter({ dir: getMailTestOutboxDir() });
    return sender === 'smtp' ? createSmtpMailAdapter(options) : createGatewayMailAdapter(options);
};

module.exports = {
    createHttpMailAdapter,
    createGatewayMailAdapter,
    createSmtpMailAdapter,
    createMemoryMailAdapter,
    pickSender,
    renderTemplate,
    TEMPLATES,
};
