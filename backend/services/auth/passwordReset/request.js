'use strict';

// 비밀번호 재설정 요청 파일, 안 쓴 토큰 폐기 · 새 토큰 · 메일
// 없는 이메일도 같은 응답 (가입 여부 숨김), 메일 실패는 삼킴
const userRepository = require('../../../repositories/user.repositories');
const mailAdapter = require('../../../mail/mailAdapter');
const { withDeadlockRetry } = require('./retry');
const { generateRawToken, hashToken, buildResetUrl } = require('./tokens');
const { TOKEN_TTL_MS } = require('./constants');
const passwordResetTokenRepository = require('../../../repositories/auth/passwordResetToken');

// 소셜 전용 계정이면 소셜 로그인 안내 메일, 아니면 재설정 메일
exports.requestPasswordReset = async ({ email }, { mailAdapter: injectedMailAdapter } = {}) => {
    const mailer = injectedMailAdapter ?? mailAdapter.createHttpMailAdapter();
    const issued = await withDeadlockRetry(async (transaction) => {
        const user = await userRepository.findByEmail(email, {
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        if (!user) return null;

        if (user.has_local_password === false) {
            return { socialOnly: true, toEmail: user.email };
        }

        await passwordResetTokenRepository.revokeOpenTokens(user.uuid, transaction);

        const rawToken = generateRawToken();
        await passwordResetTokenRepository.createToken({
            user_id: user.uuid,
            token: null,
            token_hash: hashToken(rawToken),
            expired_at: new Date(Date.now() + TOKEN_TTL_MS),
            used: false,
        }, transaction);

        return { socialOnly: false, toEmail: user.email, rawToken };
    });

    if (!issued) return { ok: true };

    try {
        if (issued.socialOnly) {
            await mailer.sendMail({ to: issued.toEmail, template: 'SOCIAL_LOGIN_GUIDE', params: {} });
        } else {
            const resetUrl = buildResetUrl(issued.rawToken);
            if (resetUrl) {
                await mailer.sendMail({ to: issued.toEmail, template: 'PASSWORD_RESET', params: { resetUrl } });
            }
        }
    } catch {
    }

    return { ok: true };
};
