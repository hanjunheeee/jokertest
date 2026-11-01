// 종료 결과 범위: 승패 결과가 어느 계정·연결에서 확정됐는지 적어 둠
// 스토어 감시가 적고, 종료 결과 무효화 액션·결과 화면 이동 훅이 확인함
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import { isSameReceiptScope, readSelfMembershipId } from "../../utils/store/scope.js"
import { getStore } from "./storeRef.js"
import { getMembershipEpoch } from "./identityScope.js"
import { getSocketEpoch } from "./connectionScope.js"
import { isReceiptCurrent } from "./receiptScope.js"

// 확정 범위와 그 범위를 적은 승패 결과
let scope = null
let seenWin = null

// 결과가 들어온 순간의 범위 (계정·신원 세대는 그때 바꾸던 증거에서 가져옴)
function buildScope(receipt, gameId, state) {
  const socket = getSocket()
  return Object.freeze({
    accountId: receipt?.accountId ?? null,
    identityGeneration: receipt?.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch: getMembershipEpoch(),
    socketEpoch: getSocketEpoch(),
    socketId: socket?.id ?? null,
    socketConnected: socket?.connected === true,
  })
}

// 적어 둔 범위가 지금 범위·상태와 그대로인지 (계정을 모르고 받은 결과는 확정 아님)
function isScopeCurrent(recorded, currentScope, current) {
  if (recorded === null || typeof recorded !== "object") return false
  if (recorded.accountId === null || recorded.identityGeneration === null) return false
  if (!isSameReceiptScope(recorded, currentScope)) return false
  return isReceiptCurrent(recorded, current)
}

// 승패 결과가 바뀌면 범위를 새로 적음 (결과가 사라지면 범위도 지움)
export function noteWinResult(next, receipt) {
  const win = next.state?.winResult ?? null
  if (win === seenWin) return
  seenWin = win
  scope = win ? buildScope(receipt, next.gameId ?? null, next.state ?? null) : null
}

// 지금 승패 결과가 지금 범위에서 확정된 것인지
export function isConfirmedWin(winResult, currentScope, current) {
  return winResult === seenWin && isScopeCurrent(scope, currentScope, current)
}

// 지금 승패 결과가 다른 계정(또는 다른 신원 세대)에서 확정된 것인지
export function isTerminalResultFromOtherAccount(currentScope) {
  const winResult = getStore().getState().state?.winResult ?? null
  if (!winResult) return false
  if (winResult !== seenWin) return false
  if (scope === null) return false
  if (scope.accountId === null || scope.identityGeneration === null) return false
  if (currentScope === null || typeof currentScope !== "object") return false
  return scope.accountId !== currentScope.accountId
    || scope.identityGeneration !== currentScope.identityGeneration
}
