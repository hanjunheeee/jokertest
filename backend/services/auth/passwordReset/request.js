'use strict';

// 비밀번호 재설정 요청 파일, 안 쓴 토큰 폐기 · 새 토큰 · 메일
// passwordReset 입구로 controllers/auth/passwordReset.js가 부름, 없는 이메일도 같은 응답 (가입 여부 숨김)
const userRepository = require('../../../repositories/user');
const mailAdapter = require('../../../utils/adapters/mail');
const { withDeadlockRetry } = require('./retry');
const { generateRawToken, hashToken, buildResetUrl } = require('./tokens');
const { TOKEN_TTL_MS } = require('./constants');
const resetTokenRepository = require('../../../repositories/auth/passwordResetToken');

// 소셜 전용 계정이면 소셜 로그인 안내 메일, 아니면 재설정 메일
exports.requestPasswordReset = async ({ email }, { mailAdapter: injectedMailAdapter } = {}) => {
    const mailer = injectedMailAdapter ?? mailAdapter.createHttpMailAdapter();
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

        // 여기부터 진짜 바뀜: 안 쓴 토큰 폐기 → 새 토큰 (DB엔 해시만, 원래 토큰 칸은 null)
        await resetTokenRepository.revokeOpenTokens(user.uuid, transaction);

        const rawToken = generateRawToken();
        await resetTokenRepository.createToken({
            user_id: user.uuid,
            token: null,
            token_hash: hashToken(rawToken),
            expired_at: new Date(Date.now() + TOKEN_TTL_MS),
            used: false,
        }, transaction);

        return { socialOnly: false, toEmail: user.email, rawToken };
    });

    if (!issued) return { ok: true };

    // 메일은 트랜잭션 끝난 뒤 (데드락 재시도 때 메일 겹치지 않게)
    try {
        if (issued.socialOnly) {
            await mailer.sendMail({ to: issued.toEmail, template: 'SOCIAL_LOGIN_GUIDE', params: {} });
        } else {
            // 앱 주소 설정 없어 링크 못 만들면 메일 안 보냄
            const resetUrl = buildResetUrl(issued.rawToken);
            if (resetUrl) {
                await mailer.sendMail({ to: issued.toEmail, template: 'PASSWORD_RESET', params: { resetUrl } });
            }
        }
    } catch {
        // 메일 실패는 삼킴 (응답이 달라지면 가입 여부 드러남)
    }

    return { ok: true };
};
