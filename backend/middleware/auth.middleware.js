const { createError }  = require("../utils/appError");
const sessionLifecycle = require("../auth/sessionLifecycle");

exports.verifyToken = async (req, res, next) => {
    let decoded;

    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return next(createError("로그인이 필요합니다.", 401));
        }

        decoded = sessionLifecycle.verifyAccessToken(token);
    } catch (error) {
        // 서명 자체가 만료된 경우만 별도 code를 붙인다 — 프론트가 이 code를 볼 때만
        // POST /auth/refresh를 시도하고, 그 외(서명 위조·형식 오류 등)에는 곧장
        // 로그아웃 처리해 무의미한 갱신 시도를 반복하지 않는다(F-03 A-07).
        if (error?.name === "TokenExpiredError") {
            // 여기서 res.clearCookie("accessToken")를 부르면 안 된다 — Set-Cookie는 브라우저가
            // 응답을 받는 즉시(자바스크립트가 body를 읽기도 전에) 적용되므로, 만료된 액세스
            // 토큰은 아직 유효한 갱신 자격으로 복구 가능한데도 그 순간 쿠키 자체가 사라진다.
            // 페이지 진입 시 흔한 "me + profile(+소켓 인증)" 같은 동시 요청 중 하나라도 먼저
            // 이 응답을 받으면, 갱신이 끝나기 전에 도착하는 다른 동시/후속 요청은 쿠키가 이미
            // 없는 채로 도착해 code 없는 일반 401("로그인이 필요합니다.")을 받고, 프론트는
            // 그 경우 갱신을 시도하지 않고 즉시 전역 로그아웃/리다이렉트한다 — 정상 갱신이
            // 진행 중이거나 성공을 앞두고 있어도 그 경쟁에서 진다(F-03 실제 Chrome 재현,
            // 2026-09-10 R-IMPL 반송). 쿠키를 지우지 않고 그대로 두면 이후 요청도 동일하게
            // 복구 가능한 ACCESS_TOKEN_EXPIRED만 받으므로, 갱신이 성공하면 새 Set-Cookie가
            // 이 쿠키를 교체하고, 갱신이 실패하면(자격 자체가 폐기·만료) 그때 명시적으로
            // 로그아웃된다 — 진짜 인증 실패는 여전히 거부된다.
            return next(createError("액세스 토큰이 만료되었습니다.", 401, "ACCESS_TOKEN_EXPIRED"));
        }
        res.clearCookie("accessToken");
        return next(createError("유효하지 않거나 만료된 토큰입니다.", 401));
    }

    // 보호 요청마다 현재 세션과 활성 밴을 함께 읽는다. 캐시를 두지 않아 로그아웃·타기기
    // 로그인·운영 밴이 다음 요청부터 즉시 반영된다. Socket.IO의 authenticateSocket도 같은
    // sessionLifecycle.resolveSession을 호출하므로 두 경로의 판정이 항상 같다(F-03 AC-05).
    let result;
    try {
        result = await sessionLifecycle.resolveSession(decoded);
    } catch (error) {
        // DB 장애를 401로 바꾸면 접속자 전원이 로그아웃되고 원인도 가려집니다. 5xx로 보냅니다.
        return next(error);
    }

    if (!result.ok) {
        res.clearCookie("accessToken");
        return next(createError(result.message, result.status));
    }

    req.user = decoded;
    next();
};
