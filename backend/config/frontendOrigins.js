// 프런트 주소 설정 파일, 허용 주소 목록(데스크톱·모바일) · 소셜 로그인 돌아갈 주소 고르기
// index.js(HTTP·socket CORS)·services/auth/social 입구가 부름, 값은 부를 때 env에서 읽음

// 앞뒤 공백·끝 슬래시 뺌 (문자열 아니면 빈 값)
const clean = (value) => (typeof value === "string" ? value.trim().replace(/\/+$/, "") : "");

// 모바일 주소 (없으면 빈 값)
const mobileUrl = () => clean(process.env.FRONTEND_MOBILE_URL);

// 값 있는 주소만 목록으로 (와일드카드·임의 주소 없음)
const getAllowedOrigins = () =>
    [process.env.FRONTEND_URL, process.env.FRONTEND_MOBILE_URL].map(clean).filter(Boolean);

// cors origin 값: 모바일 없으면 지금처럼 FRONTEND_URL 그대로, 있으면 목록
const getCorsOrigin = () => (mobileUrl() ? getAllowedOrigins() : process.env.FRONTEND_URL);

// client는 "mobile"만 인정, 나머지는 전부 데스크톱
const parseClient = (value) => (value === "mobile" ? "mobile" : "desktop");

// 모바일에서 시작했고 모바일 주소 있을 때만 모바일로, 나머지는 FRONTEND_URL 그대로
const resolveFrontendBase = (client) =>
    (client === "mobile" && mobileUrl() ? mobileUrl() : process.env.FRONTEND_URL);

module.exports = { getAllowedOrigins, getCorsOrigin, parseClient, resolveFrontendBase };
