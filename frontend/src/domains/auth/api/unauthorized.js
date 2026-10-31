import { useAuthStore } from "@/domains/auth/store/auth.store";

export const handleAuthUnauthorized = async (errorData) => {
    useAuthStore.getState().logout();

    if (window.location.pathname !== "/login") {
        window.location.replace("/login");
        return;
    }

    throw new Error(errorData.message || "인증에 실패했습니다.");
};
