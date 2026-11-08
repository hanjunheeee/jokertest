// 보안 헤더 미들웨어 파일, 기본 보안 헤더 붙이기 · Express 이름 헤더 빼기
// index.js가 라우터 앞에 붙임 (API 응답은 JSON뿐이라 화면 꾸미기 헤더는 안 씀)

// 모든 응답에 붙일 헤더 (끼워 넣기·MIME 추측·주소 새기 막기)
const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

// 서버 종류 숨기기 + 기본 보안 헤더, 운영(https)일 때만 HSTS
exports.securityHeaders = (req, res, next) => {
    res.removeHeader("X-Powered-By");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(name, value);
    }
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
};
