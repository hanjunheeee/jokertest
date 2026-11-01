// OAuth state 파일, state 발급 · 소비 (한 번만, 같은 브라우저만)
// 컨트롤러·콜백 흐름·계정 연결이 부름
const userRepository = require("../../../repositories/user.repositories");
const { createError } = require("../../../utils/appError");
const { VALID_PURPOSES, OAUTH_STATE_TTL_MS } = require('./constants');
const { generateOpaqueToken, hashValue } = require('./tokens');

// 연결 목적이면 살아 있는 세션 확인 뒤 발급, 브라우저 지문은 해시로
exports.issueOAuthState = async ({ purpose, userId = null, sessionId = null, browserFingerprint }) => {
    if (!VALID_PURPOSES.has(purpose)) {
        throw createError("state 발급 목적이 올바르지 않습니다.", 400);
    }
    if (purpose === "link") {
        if (!userId || !sessionId) {
            throw createError("계정 연결을 위한 state는 로그인한 사용자만 발급할 수 있습니다.", 400);
        }
        const activeSession = await userRepository.findActiveSession(sessionId, userId);
        if (!activeSession) {
            throw createError("유효한 로그인 세션이 아닙니다. 다시 로그인해주세요.", 401, "SESSION_INVALID");
        }
    }
    if (typeof browserFingerprint !== "string" || !browserFingerprint) {
        throw createError("요청 출처 정보가 없습니다.", 400);
    }

    const rawState = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await userRepository.createOAuthState({
        state_hash: hashValue(rawState),
        purpose,
        user_id: purpose === "link" ? userId : null,
        session_id: purpose === "link" ? sessionId : null,
        browser_fingerprint_hash: hashValue(browserFingerprint),
        expires_at: expiresAt,
    });

    return { state: rawState, expiresAt };
};

// 없음 → 이미 씀 → 만료 → 지문 다름 → 목적 다름 순으로 거절, 통과면 쓴 표시
const consumeOAuthStateTx = async (rawState, { browserFingerprint, purpose } = {}, transaction) => {
    if (typeof rawState !== "string" || !rawState) {
        throw createError("state가 없습니다.", 400, "STATE_MISSING");
    }
    if (typeof browserFingerprint !== "string" || !browserFingerprint) {
        throw createError("요청 출처 정보가 없습니다.", 400, "STATE_MISSING");
    }

    const stateHash = hashValue(rawState);
    const row = await userRepository.findOAuthStateByHash(stateHash, {
        transaction, lock: transaction.LOCK.UPDATE,
    });

    if (!row) {
        throw createError("유효하지 않은 state입니다.", 400, "STATE_INVALID");
    }
    if (row.consumed_at) {
        throw createError("이미 사용된 state입니다.", 409, "STATE_REUSED");
    }
    if (row.expires_at <= new Date()) {
        throw createError("만료된 state입니다. 다시 시도해주세요.", 400, "STATE_EXPIRED");
    }
    if (row.browser_fingerprint_hash !== hashValue(browserFingerprint)) {
        throw createError("요청 출처가 일치하지 않습니다.", 400, "STATE_FINGERPRINT_MISMATCH");
    }
    if (purpose && row.purpose !== purpose) {
        throw createError("state의 용도가 올바르지 않습니다.", 400, "STATE_PURPOSE_MISMATCH");
    }

    await userRepository.markOAuthStateConsumed(row.id, { transaction });

    return { purpose: row.purpose, userId: row.user_id, sessionId: row.session_id };
};

// state 소비를 트랜잭션 하나로
exports.consumeOAuthState = async (rawState, opts = {}) => {
    return await userRepository.withTransaction((transaction) => consumeOAuthStateTx(rawState, opts, transaction));
};
