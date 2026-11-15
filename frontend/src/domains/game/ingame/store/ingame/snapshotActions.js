// 스냅샷 액션 묶음: 판이 있을 때 반영·빈 스토어에서 처음 채우기
// 입구가 create 때 펼쳐 씀, 스냅샷 묻기(request.js)·카드 추방 훅이 응답을 넘김
import {
  CLEARED_DAWN_REPORT,
  CLEARED_NIGHT_PRIVATE_RESULT,
} from "../../constants/store/ingameStore.js"
import { claimsForeignMembership } from "../../utils/store/scope.js"
import {
  applySessionSnapshotPure,
  bootstrapSessionSnapshotPure,
} from "../../utils/snapshot/applySnapshot.js"
import { adoptIdentityScope } from "./identityScope.js"
import { commitWithReceipt } from "./receiptScope.js"

// 새 밤에 들어서는 순간인지 (같은 밤 안에서 다시 오면 아님)
function entersNewNight(before, after) {
  if (after?.phase !== "NIGHT") return false
  if (before?.phase === "NIGHT" && before?.dayIndex === after?.dayIndex) return false
  return true
}

export const snapshotActions = (set) => ({
  // 스냅샷 반영
  // 수신 범위는 신원 범위를 맞추기 전·후로 나눠 읽으므로 부르는 자리를 바꾸지 않음
  // 낮 시작 연출은 스냅샷으로 다시 안 틂 (새로고침·늦게 붙은 사람), 새 밤이면 남은 것도 지움
  applySessionSnapshot: (response, receiptContext = null) =>
    commitWithReceipt(receiptContext, set, (current) => {
      // 바뀐 게 없거나 남의 소속을 내 것이라 하면 그대로
      const patch = applySessionSnapshotPure(current, response)
      if (patch === current) return current
      if (claimsForeignMembership(current, patch.state)) return current

      const gameId = current.gameId ?? null
      const willClear = entersNewNight(current.state, patch.state)

      // 여기부터 확정: 순번 올리고 신원 범위 맞춤
      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(gameId, patch.state)
      return {
        ...patch,
        // 새 밤으로 들어가면 지난 밤 개인 결과(조사·확인 결과)·지난 낮 시작 연출 비움 (실시간 경로와 같게)
        ...(willClear ? { ...CLEARED_NIGHT_PRIVATE_RESULT, ...CLEARED_DAWN_REPORT } : {}),
        snapshotSeq,
      }
    }),

  // 빈 스토어 채우기 (판이 이미 있으면 그대로, 요청 계정과 다른 본인을 주장하면 거절)
  bootstrapSessionSnapshot: (response, receiptContext = null) =>
    commitWithReceipt(receiptContext, set, (current) => {
      if (current.gameId || current.state) return current
      if (receiptContext !== null) {
        if (receiptContext.accountId !== null && response?.self?.uuid !== receiptContext.accountId) return current
      }
      const patch = bootstrapSessionSnapshotPure(response)
      if (!patch) return current

      // 여기부터 확정: 옛 개인 결과·낮 시작 연출은 비움
      const gameId = patch.gameId ?? null
      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(gameId, patch.state)
      return {
        ...patch,
        error: null,
        snapshotSeq,
        ...CLEARED_NIGHT_PRIVATE_RESULT,
        ...CLEARED_DAWN_REPORT,
      }
    }),
})
