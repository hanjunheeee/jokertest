// 401 공통 처리: 로그인 상태 지우고 로그인 화면으로
// main.jsx가 setUnauthorizedHandler로 shared/api/response.js에 넣어 씀
import { useAuthStore } from "@/domains/auth/store/auth.store";

// 로그인 상태부터 지움, 이미 로그인 화면이면 이동 대신 에러
export const handleAuthUnauthorized = async (errorData) => {
    useAuthStore.getState().logout();

    // 다른 화면이면 로그인 화면으로 (페이지 새로 읽음)
    if (window.location.pathname !== "/login") {
        window.location.replace("/login");
        return;
    }

    // 로그인 화면에선 에러로 넘겨 부르는 쪽이 실패 문구 띄움
    throw new Error(errorData.message || "인증에 실패했습니다.");
};
