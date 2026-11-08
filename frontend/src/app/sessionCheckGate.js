// 세션 확인 첫 단계 맞추기 (FE-010)
// App이 첫 그리기 때 한 번 부름
import { useAuthStore } from "@/domains/auth/store/auth.store"

// 세션 확인은 effect에서 시작해 첫 그리기 땐 아직 idle → 문지기가 그대로 판정해 버림
// 첫 그리기 전에 확인 중으로 둬서 보호 화면이 확인 끝까지 기다리게 함
export function markSessionCheckPending(store = useAuthStore) {
    if (store.getState().sessionBootstrap === "idle") store.getState().setSessionBootstrap("pending")
    return true
}
