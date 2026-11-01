// 로그인·로그아웃 파일, 잠금·정지·비번 확인 뒤 세션 발급 · 로그아웃 기록 남기고 그 세션 끊기
// 세션 발급은 입구 객체로 불러 시험 패치 먹게 (저장소도 모듈 객체로 불러 시험 패치 그대로 먹게)
const userRepository          = require("../../../repositories/user");
const { comparePassword } = require("../../../utils/auth/credentials");
const { createError }         = require("../../../utils/appError");

// (트랜잭션) 계정 잠금 → 잠김 → 정지 → 비번 비교 → 기록 → 실패 5번이면 15분 잠금 / 성공이면 세션
exports.login = async (loginData, reqInfo) => {
    const { email, password, rememberMe } = loginData ?? {};

    if (!email?.trim() || !password) {
        throw createError("이메일과 비밀번호를 입력해주세요.", 400);
    }

    const outcome = await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.findByEmail(email.trim(), { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) {
            throw createError("가입되지 않은 이메일입니다.", 401);
        }

        if (user.locked_until && user.locked_until > new Date()) {
            throw createError("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.", 423);
        }

        const activeBan = await userRepository.checkActiveBan(user.uuid);
        if (activeBan) {
            await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });
            return { error: createError(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`, 403) };
        }

        const isMatch = await comparePassword(password, user.password_hash);

        await userRepository.createLoginHistory({
            user_id:    user.uuid,
            ip_address: reqInfo.ip,
            user_agent: reqInfo.userAgent,
            success:    isMatch,
        }, { transaction });

        if (!isMatch) {
            const failCount   = user.failed_login_count + 1;
            const lockedUntil = failCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

            await userRepository.updateUser(user.uuid, {
                failed_login_count: failCount,
                locked_until:       lockedUntil,
            }, { transaction });

            if (lockedUntil) {
                return { error: createError("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.", 423) };
            }
            return { error: createError(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`, 401) };
        }

        await userRepository.updateUser(user.uuid, {
            failed_login_count: 0,
            locked_until:       null,
            last_login_at:      new Date(),
        }, { transaction });

        const { token, refreshToken, refreshTokenExpiresAt } =
            await require('./index').issueSessionForUser(user, { rememberMe }, reqInfo, transaction);

        return { value: { user, token, refreshToken, refreshTokenExpiresAt } };
    });
    if (outcome.error) throw outcome.error;
    return outcome.value;
};

// 마지막 로그인 기록에 로그아웃 시각 + 그 세션 끊기 (세션 컨트롤러가 부름)
exports.logout = async ({ uuid, sessionId }) => {
    await userRepository.recordLogout(uuid, sessionId);
};
