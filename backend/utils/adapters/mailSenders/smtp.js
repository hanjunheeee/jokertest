'use strict';

// SMTP 발송기 파일 (Gmail 앱 비밀번호 등), nodemailer로 한 통씩 보내고 끝나면 연결 닫음
// adapters/mail.js가 MAIL_SMTP_HOST 있을 때 고름, 시험은 createTransport를 바꿔 끼움
const { prepareMail, isMailAddress, readTimeoutMs, hasText } = require('./templates');

// 기본 기다리는 시간 (연결·암호화·로그인·보내기 합쳐서) · 기본 포트 (465 = 처음부터 암호화)
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_PORT = 465;

// 기본 연결 만들기: nodemailer (부를 때 require, 게이트웨이만 쓰는 곳은 안 읽음)
const nodemailerTransport = (options) => require('nodemailer').createTransport(options);

// 포트: 비면 465, 1~65535 정수만, 아니면 null (안 보냄)
const readPort = (raw) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_PORT;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
};

// Gmail 앱 비밀번호는 화면에 4자씩 띄어 보여서 빈칸을 뺌 (다른 서버 비밀번호는 그대로)
const passwordFor = (host, pass) => (host.trim().toLowerCase() === 'smtp.gmail.com' ? pass.replace(/\s+/g, '') : pass);

// SMTP 발송기: 설정은 MAIL_SMTP_* + 보내는 사람 PASSWORD_RESET_MAIL_FROM
const createSmtpMailAdapter = ({
    host = process.env.MAIL_SMTP_HOST,
    port = process.env.MAIL_SMTP_PORT,
    user = process.env.MAIL_SMTP_USER,
    pass = process.env.MAIL_SMTP_PASS,
    from = process.env.PASSWORD_RESET_MAIL_FROM,
    timeoutMs = readTimeoutMs(process.env.PASSWORD_RESET_MAIL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    createTransport = nodemailerTransport,
} = {}) => {
    // 실패는 { ok: false }로만 돌려줌 (모르는 목적만 던짐), 원인·비밀번호는 밖에 안 드러냄
    const sendMail = async ({ to, template, params = {} }) => {
        const rendered = prepareMail(template, params);
        const portNumber = readPort(port);
        // 설정 빠졌거나 받는 주소 틀렸거나 문구 못 만들면 안 보냄
        if (!hasText(host) || !hasText(user) || !hasText(pass) || !hasText(from)
            || !portNumber || !isMailAddress(to) || !rendered) {
            return { ok: false };
        }

        // 465는 처음부터 암호화, 그 밖(587 등)은 STARTTLS 필수 (비밀번호가 평문으로 안 나가게)
        let transporter;
        try {
            transporter = createTransport({
                host: host.trim(),
                port: portNumber,
                secure: portNumber === 465,
                requireTLS: portNumber !== 465,
                auth: { user: user.trim(), pass: passwordFor(host, pass) },
                connectionTimeout: timeoutMs,
                greetingTimeout: timeoutMs,
                socketTimeout: timeoutMs,
                logger: false,
                debug: false,
            });
        } catch {
            return { ok: false };
        }

        // 보내기·시간 초과 중 먼저 온 것, 받는 주소가 거절되면 실패
        let timer = null;
        try {
            const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
            const sending = Promise.resolve()
                .then(() => transporter.sendMail({ from: from.trim(), to, subject: rendered.subject, text: rendered.text }))
                .catch(() => null);
            const info = await Promise.race([sending, timeout]);
            if (!info) return { ok: false };
            const accepted = Array.isArray(info.accepted) ? info.accepted : [];
            const rejected = Array.isArray(info.rejected) ? info.rejected : [];
            if (accepted.length === 0 || rejected.length > 0) return { ok: false };
            return { ok: true };
        } finally {
            clearTimeout(timer);
            // 연결 닫기 실패는 결과에 안 섞음
            try { transporter.close?.(); } catch { /* 무시 */ }
        }
    };

    return { sendMail };
};

module.exports = { createSmtpMailAdapter, readPort };
