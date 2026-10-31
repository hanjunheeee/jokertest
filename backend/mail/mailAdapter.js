'use strict';

const https = require('https');
const { URL } = require('url');

const TEMPLATES = new Set(['PASSWORD_RESET', 'SOCIAL_LOGIN_GUIDE', 'SIGNUP_CODE']);

const renderTemplate = (template, params = {}) => {
    if (template === 'PASSWORD_RESET') {
        return {
            subject: '[Joker] 비밀번호 재설정 안내',
            text: `비밀번호를 재설정하려면 아래 링크를 열어주세요.\n\n${params.resetUrl}\n\n`
                + '본인이 요청하지 않았다면 이 메일을 무시해주세요. 이 링크는 일정 시간이 지나면 만료됩니다.',
        };
    }
    if (template === 'SOCIAL_LOGIN_GUIDE') {
        return {
            subject: '[Joker] 계정 안내',
            text: '이 이메일로 가입된 계정은 소셜 로그인 전용이라 비밀번호가 없습니다. '
                + '로그인 화면에서 사용하셨던 소셜 로그인으로 진행해주세요.',
        };
    }
    if (template === 'SIGNUP_CODE') {
        const minutes = Math.max(1, Math.floor((params.expiresInSec ?? 0) / 60));
        return {
            subject: '[Joker] 가입 인증번호',
            text: `아래 인증번호를 입력해 이메일 인증을 완료해주세요.\n\n${params.code}\n\n`
                + `이 인증번호는 발급 후 ${minutes}분 이내에만 사용할 수 있습니다. `
                + '본인이 요청하지 않았다면 이 메일을 무시해주세요.',
        };
    }
    throw new Error('알 수 없는 메일 목적입니다.');
};

const createHttpMailAdapter = ({
    gatewayUrl = process.env.PASSWORD_RESET_MAIL_GATEWAY_URL,
    gatewayToken = process.env.PASSWORD_RESET_MAIL_GATEWAY_TOKEN,
    from = process.env.PASSWORD_RESET_MAIL_FROM,
    timeoutMs = (() => {
        const parsed = Number(process.env.PASSWORD_RESET_MAIL_TIMEOUT_MS);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 5000;
    })(),
} = {}) => {
    const sendMail = async ({ to, template, params = {} }) => {
        if (!TEMPLATES.has(template)) {
            throw new Error('알 수 없는 메일 목적입니다.');
        }
        if (!gatewayUrl || !gatewayToken || !from || typeof to !== 'string' || !to) {
            return { ok: false };
        }

        let rendered;
        try {
            rendered = renderTemplate(template, params);
        } catch {
            return { ok: false };
        }

        let target;
        try {
            target = new URL(gatewayUrl);
        } catch {
            return { ok: false };
        }
        if (target.protocol !== 'https:') {
            return { ok: false };
        }

        const payload = JSON.stringify({ from, to, subject: rendered.subject, text: rendered.text });

        return await new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            const req = https.request(target, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload),
                    authorization: `Bearer ${gatewayToken}`,
                },
                timeout: timeoutMs,
            }, (res) => {
                res.on('data', () => {}); // 응답 본문은 로깅·반환 어디에도 쓰지 않는다.
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        finish({ ok: true });
                    } else {
                        finish({ ok: false });
                    }
                });
                res.on('error', () => finish({ ok: false }));
            });
            req.on('timeout', () => { req.destroy(); finish({ ok: false }); });
            req.on('error', () => finish({ ok: false }));
            req.write(payload);
            req.end();
        });
    };

    return { sendMail };
};

const createMemoryMailAdapter = () => {
    const outbox = [];
    let nextFailure = null; // 'result' | 'throw' | null

    const sendMail = async ({ to, template, params = {} }) => {
        if (!TEMPLATES.has(template)) {
            throw new Error('알 수 없는 메일 목적입니다.');
        }
        renderTemplate(template, params);

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

module.exports = { createHttpMailAdapter, createMemoryMailAdapter, renderTemplate, TEMPLATES };
