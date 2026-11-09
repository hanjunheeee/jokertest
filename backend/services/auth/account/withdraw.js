// 회원 탈퇴 파일, 판 중 거절 · 본인 확인(비번 또는 이메일 다시 쓰기) → 계정 닫기·연결 정리 → 접속 끊기
// controllers/auth/withdraw.js가 account 입구로 부름, 저장소·판 상태는 모듈 객체로 불러 시험 갈아끼우기 먹게
const userRepository  = require("../../../repositories/user");
const withdrawRepository = require("../../../repositories/user/withdraw");
const emitter         = require("../../../socket/emitter");
const { comparePassword } = require("../../../utils/auth/credentials");
const { createError } = require("../../../utils/appError");
const { createAttemptCounter } = require("./attemptCounter");
const { isInActiveGameAnywhere } = require("./activeGameCheck");
const { fetchUserSocketsEverywhere } = require("../../ops/disconnect");
const { notifySessionsRevoked } = require("../../../repositories/user/revokeSignal");

// 비번 틀린 횟수 제한 (세션 훔친 사람이 맞혀 보며 탈퇴시키기 막기, Node 여러 개면 합쳐 셈 `wrong:wd:<uuid>`)
const MAX_WRONG_ATTEMPTS = 5;
const WRONG_WINDOW_MS = 15 * 60 * 1000;
const wrongAttempts = createAttemptCounter({ kind: "wd", windowMs: WRONG_WINDOW_MS });

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
// 계정 채널로 찾음 (Node 여러 개면 다른 Node 연결도, Redis down·시간 초과면 내 Node만 = 강제 끊기와 같게)
// 찾기 실패해도 탈퇴는 이미 끝남 → 로그만 (남은 연결은 세션 주기 검사·끊김 방송이 끊음)
const disconnectSockets = async (uuid) => {
    let sockets;
    try {
        ({ sockets } = await fetchUserSocketsEverywhere(uuid, emitter.getIo()));
    } catch (error) {
        console.error("[탈퇴 소켓 찾기 실패]", error?.name ?? "Error");
        return 0;
    }
    for (const socket of sockets) {
        socket.emit("force_disconnect", { code: "ACCOUNT_WITHDRAWN", message: "회원 탈퇴가 완료되었습니다." });
        socket.disconnect(true);
    }
    return sockets.length;
};

// 판 중(어느 Node든) → 409, 판 확인 못 함 → 503, 틀린 횟수 넘음 → 429, 본인 확인 실패 → 400, 성공 → { ok: true }
exports.withdrawAccount = async ({ uuid, password, confirmEmail }, { now = Date.now } = {}) => {
    if (await isInActiveGameAnywhere(uuid)) {
        throw createError("진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다.", 409, "WITHDRAW_IN_GAME");
    }
    if ((await wrongAttempts.count(uuid, now())) >= MAX_WRONG_ATTEMPTS) {
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
        if (rejection === "WITHDRAW_PASSWORD_INVALID") await wrongAttempts.record(uuid, now());
        const [status, message] = REJECTIONS[rejection];
        throw createError(message, status, rejection);
    }
    // 커밋 뒤: 안내·끊기 먼저, 그다음 세션 끊김 알림 (알림이 먼저 가면 다른 Node가 바로 다시 확인해 "세션 만료"로 먼저 끊음)
    try {
        await disconnectSockets(uuid);
    } finally {
        notifySessionsRevoked(uuid);
    }
    await wrongAttempts.clear(uuid);
    return { ok: true };
};

// 시험이 횟수 지우기
exports.__resetWithdrawAttemptsForTests = () => wrongAttempts.resetForTests();
