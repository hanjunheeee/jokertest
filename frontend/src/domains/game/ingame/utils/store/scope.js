// 범위·소속 판단 (상태만 읽는 순수 계산): 수신 범위 비교, 본인 소속 읽기·다른 소속 주장, 지금 판 추방 알림인지
// 인게임 스토어·화면·훅이 "같은 계정·판·소속·연결에서 받은 것인지" 볼 때 사용

// 계정·신원 세대·판·소속·소속 세대·연결 세대·소켓 id·연결 여부가 모두 같아야 같음
export function isSameReceiptScope(a, b) {
  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return false
  return a.accountId === b.accountId
    && a.identityGeneration === b.identityGeneration
    && a.gameId === b.gameId
    && a.membershipId === b.membershipId
    && a.membershipEpoch === b.membershipEpoch
    && a.socketEpoch === b.socketEpoch
    && a.socketId === b.socketId
    && a.socketConnected === b.socketConnected
}

// 상태에서 본인 자리의 소속 id 찾기
export function readSelfMembershipId(state) {
  const me = state?.self?.uuid ?? null
  if (!me) return null
  return (state?.players ?? []).find((player) => player?.uuid === me)?.membershipId ?? null
}

// 이미 소속이 있는데 응답이 다른 소속을 주장하는지 (둘 중 하나라도 없으면 아님)
export function claimsForeignMembership(current, nextState) {
  const mine = readSelfMembershipId(current.state)
  if (mine === null) return false
  const next = readSelfMembershipId(nextState)
  if (next === null) return false
  return next !== mine
}

// 판 id·방 인스턴스·부팅 세대가 같고, 대상 자리의 소속까지 같아야 지금 판 추방
export function isCurrentGameKickEvent(store, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  const same = (mine, theirs) =>
    typeof mine === "string" && mine.length > 0 && mine === theirs

  if (!same(payload.gameId, store?.gameId)) return false

  const state = store?.state ?? null
  if (!same(payload.roomInstanceId, state?.roomInstanceId)) return false
  if (!same(payload.bootEpoch, state?.bootEpoch)) return false

  const seated = (state?.players ?? []).find((player) => player?.uuid === payload.targetUuid)
  if (!seated) return false
  return same(payload.targetMembershipId, seated.membershipId)
}
