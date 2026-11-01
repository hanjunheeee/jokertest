'use strict';

// 비밀번호 재설정 확인 파일, 토큰 확인 · 비번 바꾸기
// 바꾸면 접속 세션 전부 끊고 남은 토큰 폐기
const userRepository = require('../../../repositories/user.repositories');
const { hashPassword } = require('../../../utils/auth/credentials');
const { validatePassword } = require('../../../validations/auth/signup');
const { validateResetToken } = require('../../../validations/auth/passwordReset');
const { hashToken } = require('./tokens');
const { withDeadlockRetry } = require('./retry');
const passwordResetTokenRepository = require('../../../repositories/auth/passwordResetToken');

// 토큰 모양 → 없음·폐기 → 사용됨 → 만료 순으로 확인
exports.verifyPasswordReset = async (rawToken) => {
    const tokenResult = validateResetToken(rawToken);
    if (!tokenResult.ok) return { ok: false, code: 'INVALID' };

    const row = await passwordResetTokenRepository.findByHash(hashToken(rawToken));

    if (!row || row.revoked_at) return { ok: false, code: 'INVALID' };
    if (row.used) return { ok: false, code: 'USED' };
    if (row.expired_at <= new Date()) return { ok: false, code: 'EXPIRED' };
    return { ok: true, status: 'VALID' };
};

// 토큰·새 비번 확인 → (잠금) 토큰·계정 확인 → 해시 저장 → 세션 끊기 → 남은 토큰 폐기
exports.confirmPasswordReset = async (rawToken, newPassword) => {
    const tokenResult = validateResetToken(rawToken);
    if (!tokenResult.ok) return { ok: false, status: 400, code: 'INVALID' };

    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.ok) {
        return { ok: false, status: 400, code: 'INVALID_PASSWORD', message: passwordResult.message };
    }

    const tokenHash = hashToken(rawToken);

    const outcome = await withDeadlockRetry(async (transaction) => {
        const tokenRow = await passwordResetTokenRepository.lockByHash(tokenHash, transaction);
        if (!tokenRow || tokenRow.revoked_at) return { code: 'INVALID' };
        if (tokenRow.used) return { code: 'USED' };
        if (tokenRow.expired_at <= new Date()) return { code: 'EXPIRED' };

        const user = await userRepository.findByUuid(tokenRow.user_id, {
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        if (!user) return { code: 'INVALID' };
        if (user.has_local_password === false) return { code: 'SOCIAL_ONLY' };

        await passwordResetTokenRepository.markUsed(tokenRow.id, transaction);

        const password_hash = await hashPassword(passwordResult.value);
        await userRepository.updateUser(user.uuid, { password_hash }, { transaction, logging: false });

        await userRepository.markOnlineSessionsOffline(user.uuid, { transaction, logging: false });

        await passwordResetTokenRepository.revokeOpenTokens(user.uuid, transaction);

        return { code: 'OK' };
    });

    if (outcome.code === 'OK') return { ok: true };
    if (outcome.code === 'SOCIAL_ONLY') return { ok: false, status: 400, code: 'SOCIAL_ONLY' };
    if (outcome.code === 'USED') return { ok: false, status: 400, code: 'USED' };
    if (outcome.code === 'EXPIRED') return { ok: false, status: 400, code: 'EXPIRED' };
    return { ok: false, status: 400, code: 'INVALID' };
};
