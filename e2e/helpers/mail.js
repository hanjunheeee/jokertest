'use strict';

// 메일 읽기 파일, 시험 백엔드가 보낸 메일(파일 발송기 → .runtime/mail/<주소>.jsonl)에서 인증번호·링크 꺼내기
// 가입 인증·비번 재설정·이메일 바꾸기 시험이 씀 (진짜 메일은 안 나감: MAIL_TEST_OUTBOX_DIR, 운영이면 서버가 시작 거부)
const fs = require('node:fs');
const path = require('node:path');
const { MAIL_DIR, E2E } = require('./env');
const { sleep } = require('./wait');

// backend/utils/adapters/mailSenders/fileOutbox.js의 파일 이름 규칙과 같게
const outboxFileOf = (to) => path.join(MAIL_DIR, `${String(to).toLowerCase().replace(/[^a-z0-9@.+_-]/g, '_')}.jsonl`);

/**
 * 받은 메일 전부 (오래된 것 먼저)
 * @returns {{id:string,to:string,template:string,params:object,subject:string,text:string,sentAt:string}[]}
 */
function readMails(to) {
    const file = outboxFileOf(to);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

/**
 * 메일 올 때까지 기다림 (since 뒤에 온 것 중 마지막)
 * @param {string} to 받는 주소
 * @param {object} [o]
 * @param {'SIGNUP_CODE'|'PASSWORD_RESET'|'SOCIAL_LOGIN_GUIDE'|'EMAIL_CHANGE_CODE'|'EMAIL_CHANGED'} [o.template]
 * @param {number} [o.since] 이 시각(ms) 뒤에 보낸 것만 (다시 보내기 시험용)
 * @param {number} [o.timeoutMs=10000]
 */
async function waitForMail(to, { template, since = 0, timeoutMs = 10000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const found = readMails(to).filter((m) => (!template || m.template === template) && Date.parse(m.sentAt) >= since);
        if (found.length > 0) return found[found.length - 1];
        if (Date.now() > deadline) throw new Error(`메일 안 옴: ${template ?? '아무거나'} (${timeoutMs}ms)`);
        await sleep(150);
    }
}

// 가입·이메일 바꾸기 인증번호
async function waitForCode(to, template = 'SIGNUP_CODE', o = {}) {
    const mail = await waitForMail(to, { ...o, template });
    return String(mail.params.code);
}

// 비번 재설정 링크 (화면 주소 그대로, 모바일 시험이면 toMobile로 바꿔 씀)
async function waitForResetUrl(to, o = {}) {
    const mail = await waitForMail(to, { ...o, template: 'PASSWORD_RESET' });
    return String(mail.params.resetUrl);
}

// 링크의 앞 주소만 모바일 화면 주소로 (경로·token은 그대로)
function toMobile(url, mobileOrigin = E2E.mobileUrl) {
    const u = new URL(url);
    return `${mobileOrigin}${u.pathname}${u.search}`;
}

module.exports = { readMails, waitForMail, waitForCode, waitForResetUrl, toMobile, outboxFileOf };
