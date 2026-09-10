const authService       = require("../service/auth.service");
const socialAuthService = require("../service/socialAuth.service");
const userRepository    = require("../repositories/user.repositories");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie, clearRefreshCookie } = require("../auth/cookieOptions");

exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

// 가입 입력 단계에서 이메일 중복 여부만 미리 확인한다. 최종 저장 여부는 signup()이
// 다시 판단하므로, 여기서 available:true를 받아도 그 사이 다른 요청이 같은 이메일로
// 먼저 가입하면 signup()에서 409로 거부된다.
exports.checkEmail = async (req, res, next) => {
    try {
        const result = await authService.checkEmailAvailability(req.query.email);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { user, token, refreshToken, refreshTokenExpiresAt } = await authService.login(req.body, reqInfo);

        res.cookie("accessToken", token, buildSessionCookieOptions(req.body?.rememberMe, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        } else {
            // 이번 로그인이 로그인 유지를 선택하지 않아 새 갱신 자격을 발급하지 않았더라도,
            // 브라우저에는 이전 로그인 유지 세션이 남긴 영속 refreshToken 쿠키가 여전히
            // 남아있을 수 있다. authService.login()이 이미 이 계정의 이전 세션을 전부
            // 폐기했으므로(markOnlineSessionsOffline) 그 쿠키는 어차피 무효하지만, 지우지
            // 않고 두면 브라우저가 다음 액세스 토큰 만료 시 그 무효 자격으로 갱신을 시도하는
            // 상태가 남는다 — 이번 로그인이 영속 쿠키를 원치 않는다고 명시한 이상, 남아있는
            // 옛 쿠키도 함께 지운다(F-03 R-IMPL #6/AC-02).
            clearRefreshCookie(res);
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    uuid:     user.uuid,
                    nickname: user.nickname,
                    role:     user.role,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.me = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                uuid: req.user.uuid,
                role: req.user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        await userRepository.recordLogout(req.user.uuid, req.user.sessionId);
        clearSessionCookie(res);
        res.status(200).json({ success: true, message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        next(error);
    }
};

// F-05: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료한다.
// completeSocialSignup은 항상 rememberMe:false로 세션을 발급하므로(소셜 전용 계정은
// 로그인 유지를 선택할 입력 자체가 없다), login()의 "로그인 유지 미선택" 분기와 같은 이유로
// refreshToken 쿠키를 세우지 않고, 남아있을 수 있는 이전 영속 refreshToken 쿠키만 지운다.
exports.completeSocialSignup = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { intentToken, nickname, birthDate } = req.body;
        const { user, token, refreshTokenExpiresAt } = await socialAuthService.completeSocialSignup({
            intentToken, nickname, birthDate, reqInfo,
        });

        res.cookie("accessToken", token, buildSessionCookieOptions(false, refreshTokenExpiresAt));
        clearRefreshCookie(res);

        res.status(200).json({
            success: true,
            data: {
                user: {
                    uuid:     user.uuid,
                    nickname: user.nickname,
                    role:     user.role,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// F-05 AC-04/D-01 R-IMPL: 명시적 연결(link) HTTP 핸들러는 여기 두지 않는다. 이 컨트롤러가
// req.body의 provider/subject/email을 그대로 socialAuthService.linkExternalIdentity에
// 전달하면, 로그인한 사용자가 소유권 증명 없이 임의의 소셜 identity를 자기 계정에 선점할 수
// 있다(운영자 코드 검토 R-IMPL — state·세션 검증만으로는 provider/subject 자체의 진위를
// 증명하지 못한다). socialAuthService.issueOAuthState(purpose:"link")·linkExternalIdentity는
// 서버가 OAuth 교환·검증을 마친 결과만 입력으로 받는 내부 전용 계약으로 남겨 두고, F-06/F-07이
// 실제 제공자 검증 어댑터를 완성해 그 검증 결과로만 이 함수들을 호출하는 라우트를 추가할
// 때까지 공개 HTTP 경로는 두지 않는다(backend/routes/auth.routes.js 참고).

// 액세스 토큰이 만료된 뒤(F-03 AC-01) 호출된다. verifyToken을 거치지 않으므로 req.user가
// 없고, 대신 refreshToken 쿠키 자체를 authService.refresh가 검증·회전시킨다.
exports.refresh = async (req, res, next) => {
    try {
        const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(req.cookies.refreshToken);

        res.cookie("accessToken", accessToken, buildSessionCookieOptions(true, refreshTokenExpiresAt));
        // authService.refresh()는 정상 회전이든 grace(응답 유실·동시 요청) 복구든 항상 같은
        // 유효한 갱신 자격을 결정론적으로 재현해 돌려준다(F-03 R-IMPL #8) — 그래서 이제
        // refreshToken은 성공 응답에서 항상 값이 있고, 매번 그대로 Set-Cookie해도 안전하다
        // (여러 동시 요청이 모두 같은 값을 계산하므로 서로의 최신 값을 되돌릴 위험이 없다).
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        // 갱신 자격이 애초에 무효/만료/폐기됐다면 남아있는 쿠키도 함께 정리해, 클라이언트가
        // 같은 무효 쿠키로 갱신을 반복 시도하지 않게 한다.
        if (error?.status === 401 || error?.status === 403) {
            clearSessionCookie(res);
        }
        next(error);
    }
};
