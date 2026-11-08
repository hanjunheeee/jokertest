// 401 공통 처리: 로그인 상태 지우고 로그인 화면으로
// main.jsx가 setUnauthorizedHandler로 shared/api/response.js에 넣어 씀
import { useAuthStore } from "@/domains/auth/store/auth.store";

// 세션 없이 들어갈 수 있는 인증 화면 — bootstrap getMe 401 시 /login으로 튕기면 안 됨
const PUBLIC_AUTH_PATHS = new Set([
    "/",
    "/login",
    "/find-id",
    "/password-reset/request",
    "/password-reset",
]);

// 로그인 상태부터 지움, 공개 인증·로그인 화면이면 이동 대신 에러
export const handleAuthUnauthorized = async (errorData) => {
    useAuthStore.getState().logout();

    // 끝 빗금은 떼고 봄 (/find-id/·/password-reset/?token= 으로 열어도 안 튕기게)
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (PUBLIC_AUTH_PATHS.has(path)) {
        throw new Error(errorData.message || "인증에 실패했습니다.");
    }

    // 보호 화면이면 로그인 화면으로 (페이지 새로 읽음)
    window.location.replace("/login");
};
