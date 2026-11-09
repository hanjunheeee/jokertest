'use strict';

// 브라우저 시험용 파일 발송기 파일, 보낸 메일을 받는 사람마다 한 줄씩 파일에 씀 (밖으로 안 나감)
// adapters/mail.js가 MAIL_TEST_OUTBOX_DIR 있고 운영 아닐 때만 고름, e2e/helpers/mail.js가 읽음
const fs = require('fs');
const path = require('path');
const { TEMPLATES, renderTemplate, isMailAddress } = require('./templates');

// 받는 주소 → 파일 이름 (영문·숫자·@.+-_ 밖은 _로, 경로 넘어가기 막기)
const outboxFileOf = (dir, to) => path.join(dir, `${String(to).toLowerCase().replace(/[^a-z0-9@.+_-]/g, '_')}.jsonl`);

const createFileOutboxMailAdapter = ({ dir }) => {
    fs.mkdirSync(dir, { recursive: true });

    // 진짜 발송기와 같게: 모르는 목적은 던짐, 틀린 주소는 { ok: false }
    const sendMail = async ({ to, template, params = {} }) => {
        if (!TEMPLATES.has(template)) {
            throw new Error('알 수 없는 메일 목적입니다.');
        }
        const rendered = renderTemplate(template, params);
        if (!isMailAddress(to)) return { ok: false };

        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const line = JSON.stringify({ id, to, template, params, subject: rendered.subject, text: rendered.text, sentAt: new Date().toISOString() });
        fs.appendFileSync(outboxFileOf(dir, to), `${line}\n`);
        return { ok: true, id };
    };

    return { sendMail };
};

module.exports = { createFileOutboxMailAdapter, outboxFileOf };
