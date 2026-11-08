// 회원 탈퇴 파일, 판 중 거절 · 본인 확인(비번 또는 이메일 다시 쓰기) → 계정 닫기·연결 정리 → 접속 끊기
// controllers/auth/withdraw.js가 account 입구로 부름, 저장소·판 상태는 모듈 객체로 불러 시험 갈아끼우기 먹게
const userRepository  = require("../../../repositories/user");
const withdrawRepository = require("../../../repositories/user/withdraw");
const gameSession     = require("../../../game-core/gameSession");
const emitter         = require("../../../socket/emitter");
const { comparePassword } = require("../../../utils/auth/credentials");
const { createError } = require("../../../utils/appError");

// 비번 틀린 횟수 제한 (세션 훔친 사람이 맞혀 보며 탈퇴시키기 막기, 서버 메모리)
const MAX_WRONG_ATTEMPTS = 5;
const WRONG_WINDOW_MS = 15 * 60 * 1000;
const wrongAttempts = new Map();

const wrongCountOf = (uuid, nowMs) => {
    const entry = wrongAttempts.get(uuid);
    if (!entry || nowMs - entry.windowStart >= WRONG_WINDOW_MS) {
        wrongAttempts.delete(uuid);
        return 0;
    }
    return entry.count;
};
const recordWrong = (uuid, nowMs) => {
    const entry = wrongAttempts.get(uuid);
    if (entry && nowMs - entry.windowStart < WRONG_WINDOW_MS) entry.count += 1;
    else wrongAttempts.set(uuid, { windowStart: nowMs, count: 1 });
};

// 진행 중인 판에 있는지 (끝난 판·기권은 통과)
const isInActiveGame = (uuid) => gameSession.isMatchmakingBlocked(uuid)
    && Boolean(gameSession.getActiveSessionRoutingInfo(uuid));

// 본인 확인: 비번 있는 계정은 비번, 소셜 전용은 계정 이메일을 그대로 다시 씀 (대소문자·앞뒤 빈칸 무시)
const confirmOwner = async (user, { password, confirmEmail }) => {
    if (user.has_local_password !== false) {
        if (typeof password !== "string" || !password) return "WITHDRAW_PASSWORD_REQUIRED";
        return (await comparePassword(password, user.password_hash)) ? null : "WITHDRAW_PASSWORD_INVALID";
    }
    const typed = typeof confirmEmail === "string" ? confirmEmail.trim().toLowerCase() : "";
    return typed && typed === String(user.email).trim().toLowerCase() ? null : "WITHDRAW_CONFIRM_MISMATCH";
};

const REJECTIONS = {
    WITHDRAW_PASSWORD_REQUIRED: [400, "비밀번호를 입력해주세요."],
    WITHDRAW_PASSWORD_INVALID: [400, "비밀번호가 올바르지 않습니다."],
    WITHDRAW_CONFIRM_MISMATCH: [400, "계정 이메일을 정확히 입력해주세요."],
};

// 그 사람 소켓 전부에 까닭 알리고 끊음 (주기 검사 안 기다림)
const disconnectSockets = (uuid) => {
    const sockets = emitter.getIo()?.sockets?.sockets;
    if (!sockets || typeof sockets.values !== "function") return 0;
    let count = 0;
    for (const socket of [...sockets.values()]) {
        if (socket?.data?.user?.uuid !== uuid) continue;
        socket.emit("force_disconnect", { code: "ACCOUNT_WITHDRAWN", message: "회원 탈퇴가 완료되었습니다." });
        socket.disconnect(true);
        count += 1;
    }
    return count;
};

// 판 중 → 409, 틀린 횟수 넘음 → 429, 본인 확인 실패 → 400, 성공 → { ok: true }
exports.withdrawAccount = async ({ uuid, password, confirmEmail }, { now = Date.now } = {}) => {
    if (isInActiveGame(uuid)) {
        throw createError("진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다.", 409, "WITHDRAW_IN_GAME");
    }
    if (wrongCountOf(uuid, now()) >= MAX_WRONG_ATTEMPTS) {
        throw createError("여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요.", 429, "WITHDRAW_LOCKED");
    }

    const rejection = await userRepository.withTransaction(async (transaction) => {
        // 같은 계정 동시 탈퇴·비번 바꾸기 겹치지 않게 행 잠금
        const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw createError("계정을 찾을 수 없습니다.", 404, "USER_NOT_FOUND");
        const failed = await confirmOwner(user, { password, confirmEmail });
        if (failed) return failed;

        // 여기부터 진짜 바뀜: 연결 정리 → 계정 닫기 (하나라도 실패하면 전부 되돌림)
        await withdrawRepository.detachAccount(uuid, user.email, { transaction, now: new Date(now()) });
        await withdrawRepository.closeAccount(uuid, { transaction });
        return null;
    });

    if (rejection) {
        if (rejection === "WITHDRAW_PASSWORD_INVALID") recordWrong(uuid, now());
        const [status, message] = REJECTIONS[rejection];
        throw createError(message, status, rejection);
    }
    wrongAttempts.delete(uuid);
    disconnectSockets(uuid);
    return { ok: true };
};

// 시험이 횟수 지우기
exports.__resetWithdrawAttemptsForTests = () => wrongAttempts.clear();
