// shared API 계층에서 401을 감지했을 때 실행할 auth 도메인 전용 처리입니다.
import { useAuthStore } from "@/domains/auth/store/auth.store";

export const handleAuthUnauthorized = async (errorData) => {
    // 전역 auth store에서 로그아웃 처리를 합니다.
    useAuthStore.getState().logout();

    // 이미 로그인 페이지가 아니라면 로그인 페이지로 이동시킵니다.
    if (window.location.pathname !== "/login") {
        window.location.replace("/login");
        return;
    }

    // 로그인 페이지에 있는 상태라면 에러를 던져 호출한 쪽에서 처리하게 합니다.
    throw new Error(errorData.message || "인증에 실패했습니다.");
};
