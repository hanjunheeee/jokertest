// 판 진행 이벤트용 범위: 지금 계정 id·캐시 새로 받기·지금 수신 범위·구독 때 범위 비교
// hooks/sessionEvents/ 파일들과 판 진행 이벤트 훅이 사용 (옛 연결·옛 신원 구독의 사건 막기)
import { useAuthStore } from "../../../../auth/store/auth.store.js"
import { readInGameReceiptScope } from "../../store/ingameStore.js"
import { refreshAccountCaches } from "../../../../user/utils/accountCacheRefresh.js"

// 로그인돼 있을 때만 계정 id, 아니면 null
export function currentAccountId() {
  const { user, isLoggedIn } = useAuthStore.getState()
  return isLoggedIn && user?.uuid ? user.uuid : null
}

// 로그인돼 있을 때만 계정 캐시를 새로 받음
export function refreshCaches(scopes, options) {
  if (currentAccountId() === null) return
  refreshAccountCaches(scopes, options)
}

// 지금 계정·신원 세대로 수신 범위 읽기
export function currentReceiptScope() {
  return readInGameReceiptScope({
    accountId: currentAccountId(),
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
}

// 구독을 붙인 때의 범위가 지금도 그대로인지
// 연결은 늘 비교, 계정은 붙일 때 로그인돼 있었으면, 판·소속은 붙일 때 판이 있었으면 비교
export function isRegistrationScopeCurrent(registered) {
  const now = currentReceiptScope()
  if (registered.socketEpoch !== now.socketEpoch) return false
  if (registered.socketId !== now.socketId) return false
  if (registered.socketConnected !== now.socketConnected) return false
  if (registered.accountId !== null) {
    if (registered.accountId !== now.accountId) return false
    if (registered.identityGeneration !== now.identityGeneration) return false
  }
  if (registered.gameId === null) return true
  if (registered.gameId !== now.gameId) return false
  if (registered.membershipId !== now.membershipId) return false
  if (registered.membershipEpoch !== now.membershipEpoch) return false
  return true
}
