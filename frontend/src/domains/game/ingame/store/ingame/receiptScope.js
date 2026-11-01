// 수신 범위: 지금 범위 읽기·받은 증거가 아직 유효한지·증거 붙여 상태 바꾸기
// 액션 묶음·밤 성공 받기·종료 결과 범위·스토어 감시가 사용, 훅은 입구를 통해 씀
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import { readSelfMembershipId } from "../../utils/store/scope.js"
import { getStore } from "./storeRef.js"
import { getMembershipEpoch } from "./identityScope.js"
import { getSocketEpoch } from "./connectionScope.js"

// 지금 상태를 바꾸고 있는 수신 증거 (스토어 감시가 종료 결과 범위로 적음)
let committing = null

// 지금 계정·판·소속·연결로 수신 범위 만들기
export function readInGameReceiptScope({ accountId = null, identityGeneration = null } = {}) {
  const { gameId, state } = getStore().getState()
  const socket = getSocket()
  return {
    accountId,
    identityGeneration,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch: getMembershipEpoch(),
    socketEpoch: getSocketEpoch(),
    socketId: socket?.id ?? null,
    socketConnected: socket?.connected === true,
  }
}

// 받은 증거가 지금 판·소속·세대·연결과 그대로인지
export function isReceiptCurrent(receipt, current) {
  if (receipt === null || typeof receipt !== "object") return false
  if (receipt.gameId !== (current.gameId ?? null)) return false
  if (receipt.membershipId !== readSelfMembershipId(current.state)) return false
  if (receipt.membershipEpoch !== getMembershipEpoch()) return false
  if (receipt.socketEpoch !== getSocketEpoch()) return false
  if (receipt.socketId !== (getSocket()?.id ?? null)) return false
  if (receipt.socketConnected !== (getSocket()?.connected === true)) return false
  return true
}

// 스냅샷이 밤 결과를 들고 올 때 그 결과 주인 기록 (밤 결과 없으면 null)
export function buildResultOwner(receipt, gameId, state, snapshotSeq) {
  if (receipt === null || typeof receipt !== "object") return null
  if (!state?.nightResult) return null
  return Object.freeze({
    accountId: receipt.accountId ?? null,
    identityGeneration: receipt.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch: getMembershipEpoch(),
    socketEpoch: receipt.socketEpoch,
    socketId: receipt.socketId,
    socketConnected: receipt.socketConnected,
    snapshotSeq,
  })
}

// 반영 뒤 상태 기준 수신 범위 (연출 복구·대기 복원의 주인으로 씀)
export function buildFollowUpScope(receipt, gameId, state) {
  return Object.freeze({
    accountId: receipt?.accountId ?? null,
    identityGeneration: receipt?.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch: getMembershipEpoch(),
    socketEpoch: getSocketEpoch(),
    socketId: receipt?.socketId ?? null,
    socketConnected: receipt?.socketConnected ?? false,
  })
}

// 증거를 붙여 상태 바꾸기: 증거가 지금 범위와 다르면 그대로 둠
export function commitWithReceipt(receipt, set, updater) {
  const previous = committing
  committing = receipt ?? null
  try {
    return set((current) => {
      if (receipt !== null && receipt !== undefined && !isReceiptCurrent(receipt, current)) return current
      return updater(current)
    })
  } finally {
    committing = previous
  }
}

// 지금 바꾸는 중인 수신 증거
export const getCommittingReceipt = () => committing
