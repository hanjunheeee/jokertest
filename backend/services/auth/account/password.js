// 비번 바꾸기 파일, 잠금 → 현재 비번 비교 → 해시 → 저장 → 세션 끊기 (트랜잭션 하나)
// controllers/profile.controller.js가 입력 검사 뒤 account 입구로 부름, 응답 문구·상태는 컨트롤러 몫
// 저장소는 모듈 객체로 불러 시험 패치 먹게
const userRepository = require("../../../repositories/user");
const { comparePassword,
        hashPassword } = require("../../../utils/auth/credentials");
const { createAttemptCounter } = require("./attemptCounter");
const { createError } = require("../../../utils/appError");

// 현재 비번 틀린 횟수 제한 (세션 훔친 사람이 끝없이 맞혀 보기 막기, Node 여러 개면 합쳐 셈 `wrong:pw:<uuid>`)
const MAX_WRONG_CURRENT_PASSWORD = 5;
const WRONG_CURRENT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const wrongAttempts = createAttemptCounter({ kind: "pw", windowMs: WRONG_CURRENT_PASSWORD_WINDOW_MS });

// 현재 비번 틀리면 { ok: false }, 너무 많이 틀렸으면 비교 없이 { ok: false, locked: true }
// 소셜로만 가입한 계정이면 400 SOCIAL_ONLY를 던짐 (오류 처리기가 응답)
// 맞으면 새 해시 저장 + 온라인 세션 끊고 { ok: true }
// 해시는 검사 결과 .value 아닌 newPassword 원문 그대로 씀 (지금 검사기는 같은 값 돌려줌)
exports.changePassword = async ({ uuid, currentPassword, newPassword }, { now = Date.now } = {}) => {
    if ((await wrongAttempts.count(uuid, now())) >= MAX_WRONG_CURRENT_PASSWORD) {
        return { ok: false, locked: true };
    }
    const outcome = await userRepository.withTransaction(async (transaction) => {
        // 같은 계정 동시 바꾸기 겹치지 않게 행 잠금
        const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
        // 소셜로만 가입한 계정은 비번이 없음 → 비교 없이 거절 (늘 틀려서 틀림 횟수만 오르는 것 막기)
        if (user.has_local_password === false) return { ok: false, socialOnly: true };
        const isMatch = await comparePassword(currentPassword, user.password_hash);
        if (!isMatch) return { ok: false };

        // 여기부터 진짜 바뀜: 새 해시 저장, 지금 세션 포함 전부 끊어 다시 로그인하게
        const password_hash = await hashPassword(newPassword);
        await userRepository.updateUser(uuid, { password_hash }, { transaction });
        await userRepository.markOnlineSessionsOffline(uuid, { transaction });
        return { ok: true };
    });
    if (outcome.socialOnly) throw createError("소셜 로그인 계정은 비밀번호가 없습니다.", 400, "SOCIAL_ONLY");
    // 틀리면 횟수 올리고, 바뀌면 지움
    if (outcome.ok) await wrongAttempts.clear(uuid);
    else await wrongAttempts.record(uuid, now());
    return outcome;
};

// 이메일 바꾸기도 현재 비번을 물어서 같은 횟수를 같이 씀 (곳마다 따로 맞혀 보기 막기)
exports.currentPasswordAttempts = {
    isLocked: async (uuid, nowMs) => (await wrongAttempts.count(uuid, nowMs)) >= MAX_WRONG_CURRENT_PASSWORD,
    recordWrong: (uuid, nowMs) => wrongAttempts.record(uuid, nowMs),
};

// 시험이 횟수 지우기
exports.__resetWrongPasswordAttemptsForTests = () => wrongAttempts.resetForTests();
