const crypto = require("crypto");
const userRepository = require("../repositories/user.repositories");
const authService = require("./auth.service");
const { hashPassword } = require("../utils/hash");
const { createError } = require("../utils/appError");
const { validateNickname, validateBirthDate } = require("../validation/signupValidation");

// F-05 소셜 계정 공통 기반. 제공자별 실제 OAuth 연동(F-06/F-07)은 이 파일의 책임이 아니다 —
// 여기 모든 함수는 이미 서버가 검증을 마친 결과(provider/subject/email, state 원문)만
// 입력으로 받는다(A-04). 콜백 라우트가 실제로 생기면 그 라우트가 이 함수들을 호출한다.

// state·intent 토큰 모두 무작위 256비트 원문을 발급하고 sha256 해시만 저장한다 —
// auth.service.js의 refresh token과 같은 원칙(원문을 절대 저장하지 않는다).
const generateOpaqueToken = () => crypto.randomBytes(32).toString("base64url");
const hashValue = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // state는 리다이렉트 왕복 시간만 견디면 된다.
const SOCIAL_SIGNUP_INTENT_TTL_MS = 30 * 60 * 1000; // 가입 보완 폼을 채우는 동안 유지된다.

const VALID_PURPOSES = new Set(["login", "link"]);

// ── OAuth state 발급/소비 (AC-05) ────────────────────────────────────────────

// purpose: "login"(최초 인증) 또는 "link"(로그인 중인 사용자의 명시적 계정 연결, AC-04/D-01).
// link는 지금 로그인해 있는 사용자에게 발급하므로 userId·sessionId가 모두 필수다 —
// userId만으로는 "그 값이 지금 유효한 인증에서 나왔다"는 것을 이후에 다시 확인할 수 없다
// (재검토 지적). sessionId는 그 인증을 실제로 발급한 특정 세션(user_sessions.id)이다.
exports.issueOAuthState = async ({ purpose, userId = null, sessionId = null, browserFingerprint }) => {
    if (!VALID_PURPOSES.has(purpose)) {
        throw createError("state 발급 목적이 올바르지 않습니다.", 400);
    }
    if (purpose === "link") {
        if (!userId || !sessionId) {
            throw createError("계정 연결을 위한 state는 로그인한 사용자만 발급할 수 있습니다.", 400);
        }
        // 발급 시점에도 이 세션이 실제로 살아있는지 확인한다 — 이미 로그아웃되었거나
        // 다른 이유로 폐기된 세션의 사용자로는애초에 link state 자체를 만들 수 없다
        // (F-05 AC-04, "시작 세션의 유효한 인증" 요구).
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

// 실제 소비 로직 — 이미 열려 있는 트랜잭션 안에서 행 잠금(FOR UPDATE)을 잡고 검증한다.
// handleOAuthCallback·linkExternalIdentity가 자신의 트랜잭션 안에서 그대로 재사용하고,
// 아래 exports.consumeOAuthState는 독립 호출(A-04 격리 테스트)을 위해 자체 트랜잭션을 연다.
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

    // 발급된 적 없는(위조된) state는 해시가 어떤 행과도 매치되지 않는다.
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

    // 조회와 같은 트랜잭션·같은 잠긴 행 안에서 소비 처리까지 커밋한다 — 동시에 들어온 두
    // 요청 중 먼저 잠금을 얻은 쪽만 소비에 성공하고, 나머지는 그 커밋 이후에야 잠금을 얻어
    // consumed_at이 이미 채워진 상태를 보고 STATE_REUSED로 거부된다.
    await userRepository.markOAuthStateConsumed(row.id, { transaction });

    return { purpose: row.purpose, userId: row.user_id, sessionId: row.session_id };
};

exports.consumeOAuthState = async (rawState, opts = {}) => {
    return await userRepository.withTransaction((transaction) => consumeOAuthStateTx(rawState, opts, transaction));
};

// ── OAuth 콜백 공통 처리 (AC-03/AC-04/AC-05) ─────────────────────────────────

// F-06 R-IMPL #3: 제공자 교환(네트워크 호출)은 state 소비보다 나중에 일어나야 한다 — 그래야
// 위조/불일치/만료/재사용 state는 Google을 부르기 전에 걸러지고, 교환 자체가 실패해도(취소가
// 아닌 네트워크·제공자 오류) 이미 소비된 state는 재사용될 수 없다. 그래서 이 함수는 더 이상
// state를 직접 소비하지 않는다 — 호출자(콜백 라우트)가 exports.consumeOAuthState로 먼저
// 소비를 커밋한 뒤에야, 성공이든 실패든 제공자를 호출하고 그 결과만 여기로 넘긴다. 아래
// exports.handleOAuthCallback은 상태 소비를 함께 묶어 처리해야 하는 기존/테스트 호출부
// (state 소비와 계정 판정이 원자적으로 한 번에 끝나야 하는 자리)를 위해 그대로 남겨둔다.
//
// rememberMe: 사용자가 로그인 시작 시점에 선택한 "로그인 상태 유지" 값. 재로그인(LOGIN)
// 판정에서 세션을 발급할 때 그대로 쓴다 — 컨트롤러가 이 함수 호출 뒤에 다시 세션을 발급하지
// 않아도 되도록, 세션 발급은 여기 한 번으로 끝난다(F-06 R-IMPL #2: 이중 발급 금지).
exports.resolveOAuthAccount = async ({
    provider, subject, email, cancelled, rememberMe = false, reqInfo = {},
}) => {
    if (cancelled === true) {
        throw createError("사용자가 로그인을 취소했습니다.", 400, "OAUTH_CANCELLED");
    }
    if (typeof provider !== "string" || !provider || typeof subject !== "string" || !subject) {
        throw createError("제공자 정보가 올바르지 않습니다.", 400, "PROVIDER_INVALID");
    }

    return await userRepository.withTransaction(async (transaction) => {
        const existingIdentity = await userRepository.findExternalIdentity(
            { provider, subject }, { transaction, lock: transaction.LOCK.UPDATE },
        );

        // AC-03: 재로그인 — 이미 연결된 identity가 있으면 그 계정을 그대로 재사용한다.
        if (existingIdentity) {
            const user = await userRepository.findByUuid(existingIdentity.user_id, { transaction });
            if (!user) {
                throw createError("연결된 계정을 찾을 수 없습니다.", 404, "LINKED_USER_MISSING");
            }
            const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
            return { status: "LOGIN", user, ...session };
        }

        // AC-02/AC-05: 새 identity — users.email이 NOT NULL이라 이메일 없이는 계정을
        // 만들 수 없다. 서버가 임의의 공용 이메일을 지어내지 않고 그대로 거부한다.
        if (typeof email !== "string" || !email.trim()) {
            throw createError("제공자로부터 이메일을 받지 못했습니다.", 400, "EMAIL_MISSING");
        }
        const normalizedEmail = email.trim();

        // AC-04: 같은 이메일의 기존 계정이 있어도 여기서 자동으로 병합하지 않는다. 병합은
        // D-01이 승인한 방식(로그인 후 명시적 연결, 아래 linkExternalIdentity)으로만 한다.
        const existingByEmail = await userRepository.findByEmail(normalizedEmail, { transaction });
        if (existingByEmail) {
            throw createError(
                "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.",
                409, "EMAIL_CONFLICT",
            );
        }

        const rawIntentToken = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + SOCIAL_SIGNUP_INTENT_TTL_MS);
        await userRepository.createSocialSignupIntent({
            intent_token_hash: hashValue(rawIntentToken),
            provider,
            subject,
            email: normalizedEmail,
            expires_at: expiresAt,
        }, { transaction });

        return { status: "SIGNUP_REQUIRED", intentToken: rawIntentToken, email: normalizedEmail, expiresAt };
    });
};

// 제공자별 연동이 검증을 마친 뒤 넘겨주는 결과만 받는다: provider/subject(고유 식별자),
// email(제공자가 준 이메일), rawState/browserFingerprint(state 검증용), cancelled(사용자가
// 제공자 화면에서 취소했는지). state 소비와 계정 판정을 한 번에 묶어서 처리하고 싶은
// 호출부(예: DB 통합 테스트가 검증하는 원자적 계약)를 위한 편의 함수 — 내부적으로
// consumeOAuthState → resolveOAuthAccount를 그대로 순서대로 호출할 뿐이다. 제공자 네트워크
// 호출이 상태 소비와 계정 판정 "사이"에 끼는 실제 콜백 라우트(F-06)는 이 함수를 쓰지 않고
// 두 단계를 직접 나눠 호출한다(user.controller.js googleAuthCallback 참고, R-IMPL #3).
exports.handleOAuthCallback = async ({
    provider, subject, email, rawState, browserFingerprint, cancelled, rememberMe = false, reqInfo = {},
}) => {
    // state 소비는 이 콜백이 최종적으로 성공하는지와 분리된 자신만의 트랜잭션에서 먼저
    // 커밋한다. state는 "제공자가 정확히 한 번 돌려준 리다이렉트"라는 사실 자체를 보장하는
    // 값이라, 사용자 취소나 이메일 미제공/충돌처럼 계정을 만들지 못하는 결과로 끝나도 이미
    // 도착한 콜백은 소비된 것으로 남아야 같은 state로의 재생(replay)을 막을 수 있다. 아래
    // 계정 생성/조회 로직과 하나의 트랜잭션으로 묶으면, 그 로직이 던지는 오류가 managed
    // transaction을 통째로 롤백시켜 방금 커밋하려던 소비까지 되돌린다(재검토 지적: 실패·
    // 취소 콜백 이후 재사용 방지가 빠져 있었다) — 그래서 소비만 별도로 먼저 커밋한다.
    // 제공자는 사용자가 동의 화면에서 취소했을 때도 원래 발급했던 state를 그대로 리다이렉트에
    // 실어 돌려주므로, 취소 여부 판정보다 항상 먼저 소비한다.
    await exports.consumeOAuthState(rawState, { browserFingerprint, purpose: "login" });

    return await exports.resolveOAuthAccount({ provider, subject, email, cancelled, rememberMe, reqInfo });
};

// ── 소셜 가입 보완 완료 (AC-02/AC-03) ────────────────────────────────────────

// 닉네임(및 선택적으로 생년월일)을 받아 실제 users 행을 만든다. password_hash는 NOT NULL
// 제약을 만족시키기 위해 매 계정마다 새로 무작위 값을 생성해 해시한다 — 여러 소셜 계정이
// 같은(공용/예측 가능한) 비밀번호를 공유하지 않는다(AC-02). 원문은 어디에도 반환·저장하지
// 않고 이 함수 안에서만 쓰고 버린다 — 소셜 전용 계정은 비밀번호 로그인 경로를 쓰지 않는다.
// rememberMe: 콜백이 SIGNUP_REQUIRED로 끝나기 전에 사용자가 선택했던 "로그인 상태 유지"
// 값을 컨트롤러가 서버 서명 쿠키로 보존해 여기까지 그대로 전달한다(F-06 R-IMPL #2). 기본값은
// false — 호출부가 넘기지 않으면 기존과 동일하게 세션 쿠키(비영속)로 발급된다.
exports.completeSocialSignup = async ({ intentToken, nickname, birthDate, rememberMe = false, reqInfo = {} }) => {
    if (typeof intentToken !== "string" || !intentToken) {
        throw createError("가입 정보가 없습니다.", 400, "INTENT_INVALID");
    }
    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
        throw createError(nicknameResult.message, 400);
    }
    // CODEX-1 재검토 지적 AC-02: 작업 지시서는 소셜 가입 보완에 "닉네임과 필수 생년월일"을
    // 요구한다 — SocialSignupForm.jsx는 이미 화면에서 생년월일을 막고 있었지만, 그건 클라이언트
    // 검증일 뿐이다. 이 함수를 직접 호출(예: intentToken만 아는 요청)하면 생년월일 없이도
    // 계정이 만들어졌다 — 서버가 같은 규칙을 다시 강제해야 한다(F-02 authService.signup의
    // validateSignupPayload와 같은 원칙, 신뢰 경계는 항상 서버).
    const birthDateResult = validateBirthDate(birthDate);
    if (!birthDateResult.ok) {
        throw createError(birthDateResult.message, 400);
    }
    const birthDateValue = birthDateResult.value;

    return await userRepository.withTransaction(async (transaction) => {
        const intentHash = hashValue(intentToken);
        const intent = await userRepository.findSocialSignupIntentByHash(intentHash, {
            transaction, lock: transaction.LOCK.UPDATE,
        });
        if (!intent) {
            throw createError("가입 정보가 만료되었거나 존재하지 않습니다. 다시 로그인해주세요.", 400, "INTENT_INVALID");
        }
        if (intent.consumed_at) {
            throw createError("이미 처리된 가입 요청입니다.", 409, "INTENT_CONSUMED");
        }
        if (intent.expires_at <= new Date()) {
            throw createError("가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.", 400, "INTENT_EXPIRED");
        }

        const existingNickname = await userRepository.findByNickname(nicknameResult.value);
        if (existingNickname) {
            throw createError("이미 사용 중인 닉네임입니다.", 409);
        }

        const randomSecret = generateOpaqueToken();
        const password_hash = await hashPassword(randomSecret);

        const user = await userRepository.createUser({
            email: intent.email,
            password_hash,
            nickname: nicknameResult.value,
            birth_date: birthDateValue,
            email_verified: true,
        }, { transaction });
        await userRepository.createUserStats(user.uuid, { transaction });
        await userRepository.createExternalIdentity({
            provider: intent.provider,
            subject: intent.subject,
            user_id: user.uuid,
            email_snapshot: intent.email,
        }, { transaction });
        await userRepository.markSocialSignupIntentConsumed(intent.id, { transaction });

        const session = await authService.issueSessionForUser(user, { rememberMe: rememberMe === true }, reqInfo, transaction);
        return { user, ...session };
    });
};

// ── 로그인 후 명시적 계정 연결 (AC-04, D-01) ─────────────────────────────────

// userId·sessionId는 이 요청을 보낸 "지금 유효하게 인증된" 세션에서 나온 값이어야 한다 —
// 이 함수는 그 세션의 사용자가 직접 "이 소셜 계정을 내 계정에 연결하겠다"고 승인한
// 흐름에서만 호출되어야 하며, rawState는 그 승인을 증명한다(purpose="link"로 발급된 state만
// 통과, issueOAuthState 참고). 재검토 지적: userId만 신뢰하면 "그 값이 발급 이후에도 계속
// 유효했다"는 것을 보장하지 못한다 — state에 결합된 sessionId가 소비(콜백) 시점에도 여전히
// 활성 상태인지 다시 확인해, 발급과 소비 사이에 로그아웃·세션 폐기가 있었다면 거부한다.
exports.linkExternalIdentity = async ({ userId, sessionId, provider, subject, email, rawState, browserFingerprint }) => {
    if (!userId || !sessionId) {
        throw createError("로그인이 필요합니다.", 401);
    }
    if (typeof provider !== "string" || !provider || typeof subject !== "string" || !subject) {
        throw createError("제공자 정보가 올바르지 않습니다.", 400, "PROVIDER_INVALID");
    }

    return await userRepository.withTransaction(async (transaction) => {
        const consumed = await consumeOAuthStateTx(rawState, { browserFingerprint, purpose: "link" }, transaction);
        if (consumed.userId !== userId || consumed.sessionId !== sessionId) {
            throw createError("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.", 400, "STATE_USER_MISMATCH");
        }

        // 콜백(소비) 시점의 유효한 인증을 이 자리에서 다시 확인한다 — state 자체가 유효해도,
        // 발급 이후 로그아웃·비밀번호 변경으로 인한 전체 세션 폐기·정지 등으로 이 세션이
        // 이미 무효화됐다면 연결을 완료시키지 않는다(재검토 지적).
        const activeSession = await userRepository.findActiveSession(sessionId, userId);
        if (!activeSession) {
            throw createError("세션이 만료되었거나 폐기되었습니다. 다시 로그인해주세요.", 401, "SESSION_REVOKED");
        }

        const existing = await userRepository.findExternalIdentity(
            { provider, subject }, { transaction, lock: transaction.LOCK.UPDATE },
        );
        if (existing) {
            if (existing.user_id !== userId) {
                throw createError("이미 다른 계정에 연결된 소셜 계정입니다.", 409, "IDENTITY_ALREADY_LINKED");
            }
            return existing; // 이미 이 계정에 연결되어 있다 — 그대로 반환(멱등).
        }

        return await userRepository.createExternalIdentity({
            provider,
            subject,
            user_id: userId,
            email_snapshot: typeof email === "string" && email.trim() ? email.trim() : null,
        }, { transaction });
    });
};
