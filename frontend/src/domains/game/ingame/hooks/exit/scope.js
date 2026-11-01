// 나가기 범위: 지금 수신 범위 읽기, 요청 때 범위가 그대로인지, 내 소속 id
// hooks/exit/ 파일들이 사용
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { readInGameReceiptScope, useInGameStore } from "../../store/ingameStore.js"

// 지금 계정·신원 세대로 수신 범위 읽기
export function readExitScopeNow() {
  const auth = useAuthStore.getState()
  return readInGameReceiptScope({
    accountId: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
  })
}

// 요청 때와 소속·소속 세대·연결 세대가 같아야 그 요청의 응답으로 봄
export function isRequestScopeCurrent(requestScope) {
  const now = readExitScopeNow()
  return now.membershipId === requestScope.membershipId
    && now.membershipEpoch === requestScope.membershipEpoch
    && now.socketEpoch === requestScope.socketEpoch
}

// 지금 판에서 내 소속 id (판이나 로그인이 없으면 null)
export function readMembershipId() {
  const { state } = useInGameStore.getState()
  const me = useAuthStore.getState().user?.uuid ?? null
  if (!state || !me) return null
  return (state.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
}
