'use strict';

// 시험용 메모리 발송기 파일, 보낸 메일을 outbox에 쌓고 다음 한 번 실패(결과·던지기)를 넣을 수 있음
// adapters/mail.js가 다시 내보냄, 서비스 시험·시험 도우미(signupProof)가 진짜 발송기 대신 넣음
const { TEMPLATES, renderTemplate, isMailAddress } = require('./templates');

const createMemoryMailAdapter = () => {
    const outbox = [];
    let nextFailure = null;

    const sendMail = async ({ to, template, params = {} }) => {
        if (!TEMPLATES.has(template)) {
            throw new Error('알 수 없는 메일 목적입니다.');
        }
        // 진짜와 같게 문구 만들기는 거침
        renderTemplate(template, params);

        // 진짜 발송기처럼 받는 사람 하나짜리 주소만 (여러 곳 보내기 시험이 진짜와 같게 막힘)
        if (!isMailAddress(to)) return { ok: false };

        if (nextFailure === 'throw') {
            nextFailure = null;
            throw new Error('mock mail adapter: injected failure');
        }
        if (nextFailure === 'result') {
            nextFailure = null;
            return { ok: false };
        }

        const id = `mem-${outbox.length + 1}`;
        outbox.push({ id, to, template, params });
        return { ok: true, id };
    };

    return {
        sendMail,
        outbox,
        failNextWithResult: () => { nextFailure = 'result'; },
        failNextWithThrow: () => { nextFailure = 'throw'; },
    };
};

module.exports = { createMemoryMailAdapter };
