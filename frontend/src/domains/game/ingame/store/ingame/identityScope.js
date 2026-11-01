// 신원 범위: 판·본인·소속이 바뀔 때마다 소속 세대와 구독 버전을 올림
// 입구 파일·스토어 감시·수신 범위가 쓰고, 화면·훅은 버전 구독으로 다시 그림
import { readSelfMembershipId } from "../../utils/store/scope.js"

let epoch = 0
let seenGameId
let seenSelfUuid
let seenMembershipId

let version = 0
const listeners = new Set()

// 판·본인·소속 중 하나라도 바뀌었으면 세대·버전 올리고 구독자에게 알림
export function adoptIdentityScope(gameId, state) {
  const selfUuid = state?.self?.uuid ?? null
  const membershipId = readSelfMembershipId(state)
  if (seenGameId === gameId && seenSelfUuid === selfUuid && seenMembershipId === membershipId) {
    return epoch
  }
  seenGameId = gameId
  seenSelfUuid = selfUuid
  seenMembershipId = membershipId
  epoch += 1
  version += 1
  for (const listener of [...listeners]) listener()
  return epoch
}

// 지금 소속 세대
export const getMembershipEpoch = () => epoch

// 지금 신원 범위 버전 (useSyncExternalStore 읽기용)
export function getInGameIdentityScopeVersion() {
  return version
}

// 신원 범위 바뀜 구독
export function subscribeInGameIdentityScope(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
