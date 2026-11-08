// 비번 바꾸기 파일, 잠금 → 현재 비번 비교 → 해시 → 저장 → 세션 끊기 (트랜잭션 하나)
// controllers/profile.controller.js가 입력 검사 뒤 account 입구로 부름, 응답 문구·상태는 컨트롤러 몫
// 저장소는 모듈 객체로 불러 시험 패치 먹게
const userRepository = require("../../../repositories/user");
const { comparePassword,
        hashPassword } = require("../../../utils/auth/credentials");

// 현재 비번 틀린 횟수 제한 (세션 훔친 사람이 끝없이 맞혀 보기 막기, 서버 메모리)
const MAX_WRONG_CURRENT_PASSWORD = 5;
const WRONG_CURRENT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const wrongAttempts = new Map();

// 창 안 틀린 횟수 (창 지났으면 지움)
const wrongCountOf = (uuid, nowMs) => {
    const entry = wrongAttempts.get(uuid);
    if (!entry) return 0;
    if (nowMs - entry.windowStart >= WRONG_CURRENT_PASSWORD_WINDOW_MS) {
        wrongAttempts.delete(uuid);
        return 0;
    }
    return entry.count;
};

// 틀린 횟수 하나 올림 (처음이면 지금부터 창 시작)
const recordWrongAttempt = (uuid, nowMs) => {
    const entry = wrongAttempts.get(uuid);
    if (entry && nowMs - entry.windowStart < WRONG_CURRENT_PASSWORD_WINDOW_MS) {
        entry.count += 1;
        return;
    }
    wrongAttempts.set(uuid, { windowStart: nowMs, count: 1 });
};

// 현재 비번 틀리면 { ok: false }, 너무 많이 틀렸으면 비교 없이 { ok: false, locked: true }
// 맞으면 새 해시 저장 + 온라인 세션 끊고 { ok: true }
// 해시는 검사 결과 .value 아닌 newPassword 원문 그대로 씀 (지금 검사기는 같은 값 돌려줌)
exports.changePassword = async ({ uuid, currentPassword, newPassword }, { now = Date.now } = {}) => {
    if (wrongCountOf(uuid, now()) >= MAX_WRONG_CURRENT_PASSWORD) {
        return { ok: false, locked: true };
    }
    const outcome = await userRepository.withTransaction(async (transaction) => {
        // 같은 계정 동시 바꾸기 겹치지 않게 행 잠금
        const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
        const isMatch = await comparePassword(currentPassword, user.password_hash);
        if (!isMatch) return { ok: false };

        // 여기부터 진짜 바뀜: 새 해시 저장, 지금 세션 포함 전부 끊어 다시 로그인하게
        const password_hash = await hashPassword(newPassword);
        await userRepository.updateUser(uuid, { password_hash }, { transaction });
        await userRepository.markOnlineSessionsOffline(uuid, { transaction });
        return { ok: true };
    });
    // 틀리면 횟수 올리고, 바뀌면 지움
    if (outcome.ok) wrongAttempts.delete(uuid);
    else recordWrongAttempt(uuid, now());
    return outcome;
};

// 시험이 횟수 지우기
exports.__resetWrongPasswordAttemptsForTests = () => wrongAttempts.clear();
