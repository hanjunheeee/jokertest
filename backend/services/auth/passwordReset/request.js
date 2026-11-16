'use strict';

// 비밀번호 재설정 요청 파일, 요청 기록 · 1분 안 다시 요청 건너뜀 · 안 쓴 토큰 폐기 · 새 토큰 · 메일 (못 보내면 로그)
// passwordReset 입구로 controllers/auth/passwordReset.js가 부름, 없는 이메일도 같은 응답 (가입 여부 숨김)
const userRepository = require('../../../repositories/user');
const mailAdapter = require('../../../utils/adapters/mail');
const { withDeadlockRetry } = require('./retry');
const { generateRawToken, hashToken, buildResetUrl } = require('./tokens');
const { TOKEN_TTL_MS, RESEND_WAIT_MS } = require('./constants');
const resetTokenRepository = require('../../../repositories/auth/passwordResetToken');
const findRequestRepository = require('../../../repositories/auth/accountFindRequest');

// 메일이 안 나가면 서버 로그에 한 줄 (응답은 늘 같아서 로그가 없으면 아무도 모름), 주소·토큰은 안 적음
const logMailFailure = (reason) => console.error('[재설정 메일 실패]', reason);

// 소셜 전용 계정이면 안내 메일, 아니면 재설정 링크 메일 (앱 주소 설정 없어 링크 못 만들면 안 보냄)
// 못 보냈으면 까닭 글, 보냈으면 null
const sendResetMail = async (mailer, issued) => {
    if (issued.socialOnly) {
        const result = await mailer.sendMail({ to: issued.toEmail, template: 'SOCIAL_LOGIN_GUIDE', params: {} });
        return result?.ok === true ? null : '발송기가 실패로 답함';
    }
    const resetUrl = buildResetUrl(issued.rawToken);
    if (!resetUrl) return '앱 주소 설정(PASSWORD_RESET_APP_URL)이 없거나 틀림';
    const result = await mailer.sendMail({ to: issued.toEmail, template: 'PASSWORD_RESET', params: { resetUrl } });
    return result?.ok === true ? null : '발송기가 실패로 답함';
};

// 소셜 전용 계정이면 소셜 로그인 안내 메일, 아니면 재설정 메일
exports.requestPasswordReset = async ({ email, ipAddress = null }, { mailAdapter: injectedMailAdapter } = {}) => {
    const mailer = injectedMailAdapter ?? mailAdapter.createHttpMailAdapter();
    // 누가 언제 요청했는지 IP만 기록 (이메일은 안 남김, 계정이 있든 없든 똑같이)
    try {
        await findRequestRepository.recordPasswordReset(ipAddress);
    } catch {
        // 기록을 못 해도 재설정 메일은 보냄
    }
    // 계정 행 잠그고 폐기·발급을 한 트랜잭션에서 (동시 요청에도 열린 토큰 하나만 남게)
    const issued = await withDeadlockRetry(async (transaction) => {
        const user = await userRepository.findByEmail(email, {
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        // 없는 이메일은 아무것도 안 함 (응답은 같게)
        if (!user) return null;

        // 소셜 전용 계정은 토큰 안 만들고 안내 메일만
        if (user.has_local_password === false) {
            return { socialOnly: true, toEmail: user.email };
        }

        // 앞 메일에서 1분 안 다시 요청이면 조용히 건너뜀 (앞 링크 살려 두고 메일 안 보냄, 응답은 없는 이메일과 같음)
        const now = Date.now();
        const latest = await resetTokenRepository.findLatestOpenToken(user.uuid, transaction);
        const isTooSoon = latest
            && now - new Date(latest.created_at).getTime() < RESEND_WAIT_MS
            && new Date(latest.expired_at).getTime() > now;
        if (isTooSoon) return null;

        // 여기부터 진짜 바뀜: 안 쓴 토큰 폐기 → 새 토큰 (DB엔 해시만, 원래 토큰 칸은 null)
        await resetTokenRepository.revokeOpenTokens(user.uuid, transaction);

        const rawToken = generateRawToken();
        // 만든 시각을 직접 넣음 (다음 요청이 1분 기다림을 이 시각으로 잼)
        await resetTokenRepository.createToken({
            user_id: user.uuid,
            token: null,
            token_hash: hashToken(rawToken),
            expired_at: new Date(now + TOKEN_TTL_MS),
            used: false,
            created_at: new Date(now),
        }, transaction);

        return { socialOnly: false, toEmail: user.email, rawToken };
    });

    if (!issued) return { ok: true };

    // 메일은 트랜잭션 끝난 뒤 (데드락 재시도 때 메일 겹치지 않게)
    try {
        const failure = await sendResetMail(mailer, issued);
        if (failure) logMailFailure(failure);
    } catch {
        // 메일 실패는 삼킴 (응답이 달라지면 가입 여부 드러남), 로그에만 남김
        logMailFailure('발송기 오류');
    }

    return { ok: true };
};

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

// 서버 켤 때 띄울 경고 글 (없으면 null): 재설정 메일이 못 나가는 설정이면 빠진 설정 이름을 알려 줌 (값은 안 적음)
// 응답은 늘 같은 200이라 설정이 빠져도 화면에선 모름 → 시작 로그로 알림
exports.describeMailWarning = (env = process.env) => {
    const missing = [];
    if (!buildResetUrl('check', env.PASSWORD_RESET_APP_URL)) missing.push('PASSWORD_RESET_APP_URL');
    // 발송기마다 꼭 있어야 하는 설정 (시험 파일 받는 곳이면 볼 것 없음)
    const sender = mailAdapter.pickSender(env);
    const needed = {
        smtp: ['MAIL_SMTP_USER', 'MAIL_SMTP_PASS', 'PASSWORD_RESET_MAIL_FROM'],
        gateway: ['PASSWORD_RESET_MAIL_GATEWAY_URL', 'PASSWORD_RESET_MAIL_GATEWAY_TOKEN', 'PASSWORD_RESET_MAIL_FROM'],
    }[sender] ?? [];
    for (const name of needed) {
        if (!hasText(env[name])) missing.push(name);
    }
    if (missing.length === 0) return null;
    return `비밀번호 재설정 메일이 안 나감 — 빠진 설정: ${missing.join(', ')}`;
};
