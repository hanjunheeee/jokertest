// 로그인·로그아웃 파일, 잠금·비번·정지 확인 뒤 세션 발급 · 로그아웃 기록 남기고 그 세션 끊기
// controllers/auth/account.js(로그인)·auth/session.js(로그아웃)가 account 입구로 부름
// 세션 발급은 입구 객체로 불러 시험 패치 먹게 (저장소도 모듈 객체로 불러 시험 패치 그대로 먹게)
const userRepository          = require("../../../repositories/user");
const { comparePassword } = require("../../../utils/auth/credentials");
const { createError }         = require("../../../utils/appError");
const { hashRefreshToken }    = require("./tokens");

// 실패 몇 번에 잠그나·얼마나 잠그나
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

// (트랜잭션) 행 잠금 → 잠김 → 비번 비교 → 기록 → 틀리면 실패 횟수·잠금 / 맞으면 정지 확인 → 세션
// 정지는 비번 맞은 뒤에만 봄 (비번 모르는 사람에게 정지 사유 안 보이기)
exports.login = async (loginData, reqInfo) => {
    const { email, password, rememberMe } = loginData ?? {};

    // 글자 아닌 값·빈 입력은 DB 가기 전에 400 (trim·bcrypt가 던져 500 되는 것 막기)
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        throw createError("이메일과 비밀번호를 입력해주세요.", 400);
    }

    // 거절도 { error }로 꺼내 밖에서 던짐 (안에서 던지면 기록·실패 횟수·세션 끊기까지 되돌아감)
    const outcome = await userRepository.withTransaction(async (transaction) => {
        // 같은 계정 동시 로그인이 실패 횟수 덮어쓰지 않게 행 잠금
        const user = await userRepository.findByEmail(email.trim(), { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) {
            throw createError("가입되지 않은 이메일입니다.", 401);
        }

        // 잠금 시간 안이면 비번 안 보고 거절 (계속 맞혀 보기 막기)
        const now = new Date();
        if (user.locked_until && user.locked_until > now) {
            throw createError("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.", 423);
        }
        // 잠금이 끝난 계정은 실패 횟수 0부터 (한 번 틀려도 다시 15분 잠기는 것 막기)
        const previousFailCount = user.locked_until ? 0 : (user.failed_login_count ?? 0);

        const isMatch = await comparePassword(password, user.password_hash);

        // 맞든 틀리든 로그인 기록 남김
        await userRepository.createLoginHistory({
            user_id:    user.uuid,
            ip_address: reqInfo.ip,
            user_agent: reqInfo.userAgent,
            success:    isMatch,
        }, { transaction });

        // 틀리면 횟수 올리고 5번째면 15분 잠금
        if (!isMatch) {
            const failCount   = previousFailCount + 1;
            const lockedUntil = failCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MS) : null;

            await userRepository.updateUser(user.uuid, {
                failed_login_count: failCount,
                locked_until:       lockedUntil,
            }, { transaction });

            if (lockedUntil) {
                return { error: createError("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.", 423) };
            }
            return { error: createError(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`, 401) };
        }

        // 비번 맞고 정지 중이면 남은 세션도 끊고 403
        const activeBan = await userRepository.checkActiveBan(user.uuid);
        if (activeBan) {
            await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });
            return { error: createError(`정지된 계정입니다. 사유: ${activeBan.reason || "운영정책 위반"}`, 403) };
        }

        // 정지 말고 쓸 수 없는 상태 계정도 세션 안 줌 (status 쓰기 시작하면 바로 먹게)
        if (user.status && user.status !== "ACTIVE") {
            return { error: createError("이용할 수 없는 계정입니다.", 403, "ACCOUNT_INACTIVE") };
        }

        // 맞으면 실패 횟수·잠금 풀고 마지막 로그인 시각 남김
        await userRepository.updateUser(user.uuid, {
            failed_login_count: 0,
            locked_until:       null,
            last_login_at:      new Date(),
        }, { transaction });

        // 같은 트랜잭션에서 세션 발급 (입구 객체로 불러 시험 패치 먹게)
        const { token, refreshToken, refreshTokenExpiresAt } =
            await require('./index').issueSessionForUser(user, { rememberMe }, reqInfo, transaction);

        return { value: { user, token, refreshToken, refreshTokenExpiresAt } };
    });
    if (outcome.error) throw outcome.error;
    return outcome.value;
};

// 그 세션 끊기 + 마지막 로그인 기록에 로그아웃 시각 (세션 컨트롤러가 부름)
exports.logout = async ({ uuid, sessionId }) => {
    await userRepository.recordLogout(uuid, sessionId);
};

// access 없이 refresh 쿠키만 있는 로그아웃: 그 refresh의 세션 찾아 끊기 (없으면 아무것도 안 함)
exports.logoutByRefreshToken = async (rawRefreshToken) => {
    if (typeof rawRefreshToken !== "string" || !rawRefreshToken) return;
    const session = await userRepository.findSessionForRefresh(hashRefreshToken(rawRefreshToken));
    if (!session || session.revoked_at) return;
    await userRepository.recordLogout(session.user_id, session.id);
};
