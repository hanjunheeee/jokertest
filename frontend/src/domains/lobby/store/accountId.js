// 지금 로그인한 계정 id 읽기 (없으면 null)
// friend·gameInvite 스토어가 계정이 바뀌었는지 볼 때 씀
import { useAuthStore } from "../../auth/store/auth.store.js";

// 로그인 상태이고 uuid가 빈 문자열이 아닐 때만 계정으로 봄
export function readAccountId() {
    const auth = useAuthStore.getState();
    return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
        ? auth.user.uuid
        : null;
}
