// 스냅샷 액션 묶음: 판이 있을 때 반영·빈 스토어에서 처음 채우기
// 입구 파일이 create 할 때 펼쳐 씀, 스냅샷 동기화 훅이 응답과 수신 증거를 넘김
import {
  CLEARED_NIGHT_PRIVATE_RESULT,
  EMPTY_NIGHT_SUCCESS_QUEUE,
} from "../../constants/store/ingameStore.js"
import { claimsForeignMembership } from "../../utils/store/scope.js"
import { entersNewNight } from "../../utils/store/nightSuccess.js"
import { buildWaitPatch, planWaitRestore } from "../../utils/store/nightPresentationWait.js"
import { applySessionSnapshotPure, bootstrapSessionSnapshotPure } from "../applySessionSnapshot.js"
import { adoptIdentityScope } from "./identityScope.js"
import { clearQueue, records } from "./nightSuccessRecords.js"
import { clearOnNightEntry, commitRecovery, planRecovery } from "./nightSuccessReception.js"
import { buildFollowUpScope, buildResultOwner, commitWithReceipt } from "./receiptScope.js"

export const snapshotActions = (set) => ({
  // 스냅샷 반영
  // 연출 복구·대기 복원 계획이 하나라도 틀리면 전체를 버림
  // 수신 범위는 신원 범위를 맞추기 전·후로 나눠 읽으므로 부르는 자리를 바꾸지 않음
  applySessionSnapshot: (response, receiptContext = null) =>
    commitWithReceipt(receiptContext, set, (current) => {
      const patch = applySessionSnapshotPure(current, response)
      if (patch === current) return current
      if (claimsForeignMembership(current, patch.state)) return current

      const gameId = current.gameId ?? null
      const candidate = { gameId, state: patch.state }
      const followUp = () => buildFollowUpScope(receiptContext, gameId, patch.state)
      const willClear = entersNewNight(current.state, patch.state)

      const recovery = planRecovery(response, candidate, followUp(), willClear ? [] : records.keys())
      if (!recovery.ok) return current
      const waitPlan = planWaitRestore(response, candidate, followUp(), current.nightPresentationWait)
      if (!waitPlan.ok) return current

      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(gameId, patch.state)
      const nightEntryPatch = clearOnNightEntry(current.state, patch.state)
      return {
        ...patch,
        ...nightEntryPatch,
        ...commitRecovery(recovery.entries, followUp(), willClear ? EMPTY_NIGHT_SUCCESS_QUEUE : current.nightSuccessQueue),
        ...buildWaitPatch(waitPlan.waiting, followUp(), gameId, patch.state),
        snapshotSeq,
        snapshotResultOwner: buildResultOwner(receiptContext, gameId, patch.state, snapshotSeq),
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

      const gameId = patch.gameId ?? null
      const candidate = { gameId, state: patch.state }
      const followUp = () => buildFollowUpScope(receiptContext, gameId, patch.state)

      const recovery = planRecovery(response, candidate, followUp(), [])
      if (!recovery.ok) return current
      const waitPlan = planWaitRestore(response, candidate, followUp(), null)
      if (!waitPlan.ok) return current

      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(gameId, patch.state)
      return {
        ...patch,
        error: null,
        snapshotSeq,
        snapshotResultOwner: buildResultOwner(receiptContext, gameId, patch.state, snapshotSeq),
        ...CLEARED_NIGHT_PRIVATE_RESULT,
        ...clearQueue(),
        ...commitRecovery(recovery.entries, followUp(), EMPTY_NIGHT_SUCCESS_QUEUE),
        ...buildWaitPatch(waitPlan.waiting, followUp(), gameId, patch.state),
      }
    }),
})
