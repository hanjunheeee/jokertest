'use strict';

// HTTPS 메일 게이트웨이 발송기 파일, {from,to,subject,text} JSON을 Bearer 키와 함께 POST (Resend 모양 그대로)
// adapters/mail.js가 SMTP 설정이 없을 때 고름, 시험은 transport를 바꿔 끼움
const https = require('https');
const { URL } = require('url');
const { prepareMail, isMailAddress, readTimeoutMs, hasText } = require('./templates');

// 기본 기다리는 시간 · 응답 본문은 이만큼만 읽음 (큰 응답에 메모리 안 쓰게)
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 64 * 1024;

// 기본 전송: https POST, 응답·오류·시간 초과 중 먼저 온 것 하나로 끝냄 → { status, bodyText } 또는 null
const httpsTransport = (target, { headers, body, timeoutMs }) => new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let req = null;
    const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
    };
    // 전체 시간 한도 (조금씩 오는 느린 응답도 끊음)
    const abort = () => {
        if (req) req.destroy();
        finish(null);
    };

    try {
        req = https.request(target, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
            const chunks = [];
            let size = 0;
            res.on('data', (chunk) => {
                size += chunk.length;
                if (size <= MAX_BODY_BYTES) chunks.push(chunk);
            });
            res.on('end', () => finish({ status: res.statusCode, bodyText: Buffer.concat(chunks).toString('utf8') }));
            res.on('error', () => finish(null));
        });
    } catch {
        finish(null);
        return;
    }
    timer = setTimeout(abort, timeoutMs);
    req.on('timeout', abort);
    req.on('error', () => finish(null));
    req.end(body);
});

// 성공 응답의 메일 id (Resend는 { id }), 없으면 null
const readMessageId = (bodyText) => {
    try {
        const parsed = JSON.parse(bodyText);
        return typeof parsed?.id === 'string' && parsed.id.length <= 200 ? parsed.id : null;
    } catch {
        return null;
    }
};

// 게이트웨이 발송기: 설정은 PASSWORD_RESET_MAIL_* 환경 변수 (가입 인증번호도 같이 씀)
const createGatewayMailAdapter = ({
    gatewayUrl = process.env.PASSWORD_RESET_MAIL_GATEWAY_URL,
    gatewayToken = process.env.PASSWORD_RESET_MAIL_GATEWAY_TOKEN,
    from = process.env.PASSWORD_RESET_MAIL_FROM,
    timeoutMs = readTimeoutMs(process.env.PASSWORD_RESET_MAIL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    transport = httpsTransport,
} = {}) => {
    // 실패는 { ok: false }로만 돌려줌 (모르는 목적만 던짐), 원인은 밖에 안 드러냄
    const sendMail = async ({ to, template, params = {} }) => {
        const rendered = prepareMail(template, params);
        // 설정 빠졌거나 받는 주소 틀렸거나 문구 못 만들면 안 보냄
        if (!hasText(gatewayUrl) || !hasText(gatewayToken) || !hasText(from) || !isMailAddress(to) || !rendered) {
            return { ok: false };
        }

        // 게이트웨이 주소가 https일 때만 (키·인증번호가 평문으로 안 나가게)
        let target;
        try {
            target = new URL(gatewayUrl.trim());
        } catch {
            return { ok: false };
        }
        if (target.protocol !== 'https:') {
            return { ok: false };
        }

        const body = JSON.stringify({ from: from.trim(), to, subject: rendered.subject, text: rendered.text });
        let response;
        try {
            response = await transport(target, {
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                    accept: 'application/json',
                    // Resend는 User-Agent 없는 요청을 막을 수 있어서 붙임
                    'user-agent': 'mmc-server-mail/1.0',
                    authorization: `Bearer ${gatewayToken.trim()}`,
                },
                body,
                timeoutMs,
            });
        } catch {
            return { ok: false };
        }

        // 2xx만 성공, 메일 id는 있을 때만
        if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
            return { ok: false };
        }
        const id = readMessageId(typeof response.bodyText === 'string' ? response.bodyText : '');
        return id ? { ok: true, id } : { ok: true };
    };

    return { sendMail };
};

module.exports = { createGatewayMailAdapter, httpsTransport };
