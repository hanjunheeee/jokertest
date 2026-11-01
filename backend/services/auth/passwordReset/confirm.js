'use strict';

// 비밀번호 재설정 확인 파일, 토큰 확인 · 비번 바꾸기
// passwordReset 입구로 controllers/auth/passwordReset.js가 부름, 바꾸면 접속 세션 전부 끊고 남은 토큰 폐기
const userRepository = require('../../../repositories/user');
const { hashPassword } = require('../../../utils/auth/credentials');
const { validatePassword } = require('../../../validations/auth/signup');
const { validateResetToken } = require('../../../validations/auth/passwordReset');
const { hashToken } = require('./tokens');
const { withDeadlockRetry } = require('./retry');
const resetTokenRepository = require('../../../repositories/auth/passwordResetToken');

// 토큰 모양 → 없음·폐기 → 사용됨 → 만료 순으로 확인 (새 비번 받기 전에 링크 먼저 봄)
exports.verifyPasswordReset = async (rawToken) => {
    // 모양 틀린 토큰은 DB 안 감
    const tokenResult = validateResetToken(rawToken);
    if (!tokenResult.ok) return { ok: false, code: 'INVALID' };

    const row = await resetTokenRepository.findByHash(hashToken(rawToken));

    // 새로 요청해 밀려난(폐기) 토큰도 없는 토큰과 같게 INVALID
    if (!row || row.revoked_at) return { ok: false, code: 'INVALID' };
    if (row.used) return { ok: false, code: 'USED' };
    if (row.expired_at <= new Date()) return { ok: false, code: 'EXPIRED' };
    return { ok: true, status: 'VALID' };
};

// 토큰·새 비번 확인 → (잠금) 토큰·계정 확인 → 해시 저장 → 세션 끊기 → 남은 토큰 폐기
exports.confirmPasswordReset = async (rawToken, newPassword) => {
    // 토큰 모양·새 비번 규칙 먼저 검사 (DB 안 감)
    const tokenResult = validateResetToken(rawToken);
    if (!tokenResult.ok) return { ok: false, status: 400, code: 'INVALID' };

    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.ok) {
        return { ok: false, status: 400, code: 'INVALID_PASSWORD', message: passwordResult.message };
    }

    const tokenHash = hashToken(rawToken);

    // 토큰·계정 행 잠그고 한 트랜잭션에서 (같은 토큰 두 번 쓰기 막기), 데드락이면 처음부터 다시
    const outcome = await withDeadlockRetry(async (transaction) => {
        // 확인 때와 같은 순서로 다시 봄 (그사이 쓰였거나 만료됐을 수 있음)
        const tokenRow = await resetTokenRepository.lockByHash(tokenHash, transaction);
        if (!tokenRow || tokenRow.revoked_at) return { code: 'INVALID' };
        if (tokenRow.used) return { code: 'USED' };
        if (tokenRow.expired_at <= new Date()) return { code: 'EXPIRED' };

        // 계정 없거나 소셜 전용 계정(로컬 비번 없음)이면 안 바꿈
        const user = await userRepository.findByUuid(tokenRow.user_id, {
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        if (!user) return { code: 'INVALID' };
        if (user.has_local_password === false) return { code: 'SOCIAL_ONLY' };

        // 여기부터 진짜 바뀜: 토큰 사용 표시 → 새 해시 저장
        await resetTokenRepository.markUsed(tokenRow.id, transaction);

        const password_hash = await hashPassword(passwordResult.value);
        await userRepository.updateUser(user.uuid, { password_hash }, { transaction, logging: false });

        // 접속 세션 전부 끊음 (옛 비번으로 들어온 세션 못 쓰게)
        await userRepository.markOnlineSessionsOffline(user.uuid, { transaction, logging: false });

        // 안 쓴 다른 토큰도 폐기 (옛 메일 링크 못 쓰게)
        await resetTokenRepository.revokeOpenTokens(user.uuid, transaction);

        return { code: 'OK' };
    });

    // 결과 코드를 응답 모양으로, 모르는 코드는 INVALID
    if (outcome.code === 'OK') return { ok: true };
    if (outcome.code === 'SOCIAL_ONLY') return { ok: false, status: 400, code: 'SOCIAL_ONLY' };
    if (outcome.code === 'USED') return { ok: false, status: 400, code: 'USED' };
    if (outcome.code === 'EXPIRED') return { ok: false, status: 400, code: 'EXPIRED' };
    return { ok: false, status: 400, code: 'INVALID' };
};
