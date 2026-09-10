const userRepository          = require("../repositories/user.repositories");
const { hashPassword,
        comparePassword }     = require("../utils/hash");
const { generateToken }       = require("../utils/jwt");
const { createError }         = require("../utils/appError");
const { validateSignupPayload } = require("../validation/signupValidation");
const {
    PERSISTENT_SESSION_MAX_AGE_MS,
    ACCESS_TOKEN_SHORT_TTL_SECONDS,
    REFRESH_TOKEN_GRACE_MS,
    capAccessTokenTtlSeconds,
} = require("../auth/cookieOptions");
const crypto                  = require("crypto");

// 갱신 자격 원문은 무작위 256비트 값이다. 서버는 이 값을 절대 저장하지 않고, 아래
// hashRefreshToken이 만든 sha256 해시만 DB에 남긴다(F-03 A-03). 로그인 시 최초 발급에만
// 쓰인다 — 그 이후의 모든 회전은 아래 deriveRotatedRefreshToken을 쓴다(F-03 R-IMPL #8).
const generateRefreshSecret = () => crypto.randomBytes(32).toString("base64url");
const hashRefreshToken      = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

// 회전으로 발급하는 새 갱신 자격은 "이전 원문 자격 + 세션ID"에 대한 HMAC으로 결정론적으로
// 유도한다(무작위가 아니다). 서버는 원문을 저장하지 않지만, 같은 입력(클라이언트가 실제로
// 들고 있는 이전 원문)이 다시 들어오면 항상 같은 출력을 재현할 수 있다 — 그래서 회전
// 성공 응답 자체가 유실돼도(네트워크 단절), 클라이언트가 이전 자격으로 재시도하기만 하면
// 서버가 저장 없이 잃어버린 새 자격을 그대로 다시 계산해 돌려줄 수 있다. 입력(이전
// 원문)이 달라지면 출력도 완전히 달라지므로(HMAC은 안전한 PRF), 서버의 비밀키 없이는
// 다음 회전 값을 미리 예측할 수 없다 — 예측 불가능성은 무작위 생성과 동등하게 유지된다
// (F-03 A-08/R-IMPL #8). 세션ID를 입력에 섞어 서로 다른 세션의 회전 체인이 절대 같은 값을
// 만들지 않게 한다. JWT_SECRET을 재사용하되 고정 라벨로 용도를 분리해, 같은 키를 다른
// 목적(JWT 서명)으로 쓰는 것과 입력 구조 자체를 다르게 둔다.
const deriveRotatedRefreshToken = (previousRawToken, sessionId) =>
    crypto.createHmac("sha256", process.env.JWT_SECRET)
        .update(`refresh-rotation-v1:${sessionId}:${previousRawToken}`)
        .digest("base64url");

exports.signup = async (userData) => {
    // 닉네임 길이·문자셋, 비밀번호 길이, 비밀번호 확인 일치, 생년월일 유효성을 여기서
    // 모두 검사한다. value에는 허용한 필드(email/password/nickname/birthDate)만 담기므로
    // role·status·email_verified 같은 관리 필드가 요청에 섞여 있어도 저장 payload에 닿지 않는다.
    const parsed = validateSignupPayload(userData);
    if (!parsed.ok) {
        throw createError(parsed.message, parsed.status ?? 400);
    }
    const { email: normalizedEmail, password, nickname: normalizedNickname, birthDate } = parsed.value;

    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
        throw createError("이미 사용 중인 이메일입니다.", 409);
    }

    const existingNickname = await userRepository.findByNickname(normalizedNickname);
    if (existingNickname) {
        throw createError("이미 사용 중인 닉네임입니다.", 409);
    }

    const password_hash = await hashPassword(password);

    // users와 user_stats는 하나의 계정을 이루는 한 덩어리입니다. 예전처럼 순차 호출하면
    // createUserStats가 실패했을 때 통계 없는 반쪽 계정이 남아, 그 계정은 이후 프로필
    // 조회·집계에서 계속 결측으로 튀어나옵니다. 실패 시 둘 다 없던 일이 되게 묶습니다.
    // (해싱은 DB와 무관하고 느리므로 트랜잭션 밖에 둬서 커넥션 점유 시간을 늘리지 않습니다.)
    return await userRepository.withTransaction(async (transaction) => {
        const user = await userRepository.createUser({
            email: normalizedEmail,
            password_hash,
            nickname: normalizedNickname,
            birth_date: birthDate,
        }, { transaction });
        await userRepository.createUserStats(user.uuid, { transaction });
        return user;
    });
};

// 가입 최종 제출 이전, 입력 단계에서 이메일 중복을 미리 확인하기 위한 함수다. signup()의
// findByEmail 사전 검사와 같은 저장소 함수를 재사용하므로 두 단계가 같은 판정을 내린다 —
// 다만 이 함수가 available:true를 돌려준 뒤에도 다른 요청이 먼저 같은 이메일로 가입할 수
// 있으므로, 최종 저장은 여전히 signup()의 유일 제약(및 findByEmail 재검사)에 의존한다.
exports.checkEmailAvailability = async (email) => {
    if (typeof email !== "string" || !email.trim()) {
        throw createError("이메일을 입력해주세요.", 400);
    }
    const existing = await userRepository.findByEmail(email.trim());
    return { available: !existing };
};

exports.login = async (loginData, reqInfo) => {
    const { email, password, rememberMe } = loginData ?? {};

    if (!email?.trim() || !password) {
        throw createError("이메일과 비밀번호를 입력해주세요.", 400);
    }

    // 유저 행을 FOR UPDATE로 잠그고 로그인 전체를 하나의 트랜잭션으로 묶는다.
    // profile.controller.js의 updatePassword도 같은 유저 행을 같은 방식으로 잠그므로,
    // 비밀번호 변경과 동시에 들어온 로그인은 둘 중 하나가 커밋될 때까지 대기한다 —
    // 그래야 "이미 바뀌고 있는 비밀번호로 통과한 로그인이 변경 완료 이후에 새 세션을
    // 만드는" 경합이 생기지 않는다(F-03 A-04/R-IMPL #7).
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
            // 감지된 시점에 이 계정의 기존 세션을 전부 영구 폐기한다 — 밴이 나중에 풀려도
            // 밴 이전 세션이 되살아나지 않게 하기 위해서다(F-03 R-IMPL #7, sessionLifecycle의
            // 같은 처리와 동일한 원칙).
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

        await userRepository.markOnlineSessionsOffline(user.uuid, { transaction });

        const sessionId = crypto.randomUUID();
        const now = new Date();

        // 로그인 유지를 선택했을 때만 회전형 갱신 자격을 발급한다. 미선택 세션은 갱신 수단
        // 자체가 없으므로 액세스 토큰이 만료되면(기존과 동일하게 1일) 재로그인이 필요하다(AC-02).
        let refreshToken = null;
        let refreshTokenHash = null;
        let refreshTokenExpiresAt = null;
        if (rememberMe === true) {
            refreshToken = generateRefreshSecret();
            refreshTokenHash = hashRefreshToken(refreshToken);
            refreshTokenExpiresAt = new Date(now.getTime() + PERSISTENT_SESSION_MAX_AGE_MS);
        }

        await userRepository.createUserSession({
            id:                       sessionId,
            user_id:                  user.uuid,
            ip_address:               reqInfo.ip,
            is_online:                true,
            refresh_token_hash:       refreshTokenHash,
            refresh_token_expires_at: refreshTokenExpiresAt,
        }, { transaction });

        // 액세스 토큰은 로그인 유지 여부와 무관하게 짧게 산다. 로그인 유지의 30일 창은 위
        // refreshToken(서버에는 해시만 저장)이 절대 만료로 책임지고, 액세스 토큰은 그 창 안에서
        // 회전형 갱신(POST /auth/refresh)으로 계속 재발급된다 — 쿠키만 오래 살고 검증되지 않는
        // 상태를 피하기 위함이다(F-03 A-01). 로그인 순간은 절대 기한이 막 새로 시작하는
        // 시점이라 capAccessTokenTtlSeconds는 사실상 no-op이지만, refresh()와 같은 계산
        // 경로를 타야 로그인·갱신 사이에 캡 로직이 갈라지지 않는다.
        const token = generateToken({
            uuid:      user.uuid,
            role:      user.role,
            sessionId: sessionId,
        }, {
            expiresIn: rememberMe === true
                ? capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, refreshTokenExpiresAt, now)
                : "1d",
        });

        return { value: { user, token, refreshToken, refreshTokenExpiresAt } };
    });
    // Persist login failure counters and ban revocation before returning domain errors.
    // Unexpected storage failures still throw inside the transaction and roll back.
    if (outcome.error) throw outcome.error;
    return outcome.value;
};

// 액세스 토큰 만료 후 회전형 갱신 자격으로 새 액세스 토큰(및 필요하면 새 갱신 자격)을
// 발급한다. 전체가 하나의 트랜잭션 안에서 행 잠금(FOR UPDATE)을 잡고 동작해, 동시에 들어온
// 회전 요청이 서로의 회전을 덮어쓰지 못하게 한다(F-03 A-03/A-08).
//
// 트랜잭션 콜백은 어떤 경우에도 throw하지 않는다 — 재사용 감지·밴 감지로 인한 세션
// 폐기(UPDATE)도 "성공한 결과"로 커밋되어야 하며, 이를 알리는 오류 응답은 커밋이 끝난
// 뒤에 던진다. 콜백 안에서 throw하면 managed transaction이 통째로 rollback되어 방금
// 커밋하려던 폐기 자체가 취소된다(F-03 R-IMPL #3) — outcome.type으로 결과를 반환하고,
// 트랜잭션이 끝난 뒤 그 타입에 맞는 오류를 던지는 구조로 이 문제를 근본적으로 없앤다.
exports.refresh = async (rawRefreshToken) => {
    if (!rawRefreshToken) {
        throw createError("갱신 자격이 없습니다. 다시 로그인해주세요.", 401);
    }

    const presentedHash = hashRefreshToken(rawRefreshToken);

    const outcome = await userRepository.withTransaction(async (transaction) => {
        const session = await userRepository.findSessionForRefresh(presentedHash, { transaction });

        if (!session) return { type: "invalid" };
        if (session.revoked_at) return { type: "revoked" };

        const now = new Date();
        if (!session.refresh_token_expires_at || session.refresh_token_expires_at <= now) {
            return { type: "expired" };
        }

        const activeBan = await userRepository.checkActiveBan(session.user_id);
        if (activeBan) {
            // 감지된 시점에 이 계정의 모든 세션을 영구 폐기한다 — 밴이 나중에 풀려도 밴
            // 이전 세션이 되살아나지 않게 하기 위해서다(F-03 R-IMPL #7).
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "banned", reason: activeBan.reason };
        }

        const isFreshMatch = session.refresh_token_hash === presentedHash;
        const isGraceMatch = !isFreshMatch
            && session.refresh_previous_hash === presentedHash
            && session.refresh_previous_expires_at
            && session.refresh_previous_expires_at > now;

        if (!isFreshMatch && !isGraceMatch) {
            // 이미 회전되어 무효화된 자격이 유예 기간 밖에서 다시 제시됐다 — 현재 세대도,
            // 직전 세대도 아니라면 2세대 이상 전 자격일 수 있다(findSessionForRefresh가
            // refresh_token_history까지 뒤져 이 세션을 찾아온 경우, F-03 R-IMPL #11). 몇
            // 세대 전이든 이미 대체된 자격의 재사용은 모두 탈취로 의심해 이 사용자의 모든
            // 세션(모든 갱신 자격 포함)을 폐기한다(A-03/A-08 재사용 감지).
            await userRepository.markOnlineSessionsOffline(session.user_id, { transaction });
            return { type: "reuse" };
        }

        // 새 액세스 토큰의 exp는 로그인 시점의 절대 30일 기한(session.refresh_token_expires_at,
        // 회전으로도 연장되지 않는다)을 넘지 않게 자른다 — 그래야 30일이 임박한 회전에서도
        // "쿠키는 살아 있는데 서명 자체는 이미 절대 기한을 넘긴" 토큰이 나가지 않는다(R-IMPL #4).
        const cappedTtlSeconds = capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, session.refresh_token_expires_at, now);
        if (cappedTtlSeconds <= 0) return { type: "expired" };

        const user = await userRepository.findByUuid(session.user_id);
        const accessToken = generateToken({
            uuid:      session.user_id,
            role:      user?.role,
            sessionId: session.id,
        }, { expiresIn: cappedTtlSeconds });

        if (isGraceMatch) {
            // 이 세션은 이미 한 번 회전되어 refresh_token_hash가 다음 세대 값을 가리키고
            // 있다. 그 회전이 만들었던 원문은 deriveRotatedRefreshToken(이전 원문, 세션ID)로
            // 결정론적으로 재현되므로, 지금 이 요청이 다시 제시한 이전 원문(rawRefreshToken)과
            // 세션ID로 같은 함수를 다시 계산하면 그때 실제로 발급했던 것과 정확히 같은 값이
            // 나온다 — 몇 번째 재시도든, 응답이 어떤 순서로 도착하든 항상 같다. 그래서
            // previous_hash를 또 앞으로 미는(재회전) 대신, 이미 회전된 결과를 그대로
            // 재계산해 돌려주기만 한다 — DB에는 아무 것도 다시 쓰지 않는다(F-03 A-08/R-IMPL
            // #5/#8: 3번째 이상의 동시 요청이나, 회전 응답 자체의 유실 모두 같은 방식으로
            // 안전하게 복구된다).
            const recoveredRawRefreshToken = deriveRotatedRefreshToken(rawRefreshToken, session.id);
            return {
                type: "ok",
                accessToken,
                refreshToken: recoveredRawRefreshToken,
                refreshTokenExpiresAt: session.refresh_token_expires_at,
            };
        }

        const newRawRefreshToken = deriveRotatedRefreshToken(rawRefreshToken, session.id);
        const newHash = hashRefreshToken(newRawRefreshToken);

        await userRepository.applyRefreshRotation(session.id, {
            newHash,
            previousHash: session.refresh_token_hash,
            previousExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_GRACE_MS),
            // 이번 회전으로 refresh_previous_hash 칸에서 밀려나는 이전 세대 해시 — 존재하면
            // (즉 이번이 이 세션의 두 번째 이상 회전이면) 이력에 남겨 2세대 이상 전 자격의
            // 재사용도 감지할 수 있게 한다(F-03 R-IMPL #11).
            evictedHash: session.refresh_previous_hash,
        }, { transaction });

        return {
            type: "ok",
            accessToken,
            refreshToken: newRawRefreshToken,
            refreshTokenExpiresAt: session.refresh_token_expires_at,
        };
    });

    switch (outcome.type) {
        case "invalid":
            throw createError("유효하지 않은 갱신 자격입니다. 다시 로그인해주세요.", 401);
        case "revoked":
            throw createError("세션이 폐기되었습니다. 다시 로그인해주세요.", 401);
        case "expired":
            throw createError("로그인 유지 기간이 만료되었습니다. 다시 로그인해주세요.", 401);
        case "banned":
            throw createError(`정지된 계정입니다. 사유: ${outcome.reason || "운영정책 위반"}`, 403);
        case "reuse":
            throw createError("갱신 자격 재사용이 감지되어 모든 세션이 종료되었습니다. 다시 로그인해주세요.", 401);
        default:
            return {
                accessToken: outcome.accessToken,
                refreshToken: outcome.refreshToken,
                refreshTokenExpiresAt: outcome.refreshTokenExpiresAt,
            };
    }
};
