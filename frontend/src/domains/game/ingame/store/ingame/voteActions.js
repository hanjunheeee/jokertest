// 투표 결과 액션 묶음: 낮 투표 판정·재판 판정 반영 (낮 마감 시각 같이 반영)
// 입구 파일이 create 할 때 펼쳐 씀, 판 진행 이벤트 손잡이(낮)가 넘김
import {
  CLEARED_DAY_PHASE_TIMER,
  CLEARED_NIGHT_PRIVATE_RESULT,
  CLEARED_NIGHT_TURN,
} from "../../constants/store/ingameStore.js"
import { getDayVoteRound, parseDayVoteRoundFields } from "../../utils/dayVoteRound.js"
import { applyTribunalResolvedPure } from "../applyTribunalResolved.js"
import { clearSelfActed } from "../../utils/store/selfActed.js"
import { clearQueue } from "./nightSuccessRecords.js"
import { clearOnNightEntry } from "./nightSuccessReception.js"
import { commitWithReceipt } from "./receiptScope.js"

// 밤에 들어설 때 개인 결과 지우는 조각 (이미 밤이면 그대로 둠)
function clearPrivateOnNightEntry(current) {
  return current.state?.phase === "NIGHT" ? null : CLEARED_NIGHT_PRIVATE_RESULT
}

export const voteActions = (set) => ({
  // 낮 투표 판정 반영: 재판·동표/기권(밤으로), 재투표는 삭제돼 안 받음
  applyDayVoteResolvedToPhase: (gameId, dayIndex, resolution = {}) =>
    set((current) => {
      const { outcome, defendantUuid, round = 1 } = resolution
      // 그 판·그 낮·그 번호일 때만
      if (typeof gameId !== "string" || gameId.trim().length === 0) return current
      if (!Number.isInteger(dayIndex)) return current
      if (!current.gameId || !current.state) return current
      if (gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (dayIndex !== current.state.dayIndex) return current
      if (round !== getDayVoteRound(current.state)) return current
      const roundFields = parseDayVoteRoundFields(resolution)
      if (!roundFields) return current
      const dayVoteResolution = {
        outcome,
        tribunalTargetUuid: outcome === "TRIBUNAL" ? defendantUuid : null,
        ...roundFields,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
      }

      // 재판: 피고가 있어야 함, 낮을 벗어나 낮 마감 시각 비움
      if (outcome === "TRIBUNAL") {
        if (typeof defendantUuid !== "string" || defendantUuid.length === 0) return current
        return {
          state: {
            ...current.state,
            phase: "TRIBUNAL",
            dayPhase: null,
            dayVoteResolution,
            tribunal: { defendantUuid },
            ...CLEARED_DAY_PHASE_TIMER,
            ...clearSelfActed(current.state),
          },
        }
      }
      // 동표·기권: 바로 밤으로, 낮 마감 시각·밤 개인 결과·성공 연출 비움
      // 받아 둔 밤 차례는 안 지움 (밤 첫 차례 방송이 이 판정보다 먼저 올 수 있음, 낮 시작 때 이미 비워서 옛 차례는 없음)
      if (outcome === "TIE" || outcome === "ABSTAINED") {
        return {
          state: {
            ...current.state,
            phase: "NIGHT",
            dayPhase: null,
            dayVoteResolution,
            ...CLEARED_DAY_PHASE_TIMER,
            ...(current.state.nightTurnRole ? {} : CLEARED_NIGHT_TURN),
            ...clearSelfActed(current.state),
          },
          ...CLEARED_NIGHT_PRIVATE_RESULT,
          ...clearQueue(),
        }
      }
      return current
    }),

  // 재판 판정 반영 (계산은 applyTribunalResolvedPure, 밤으로 가면 밤 정리 조각을 더함)
  applyTribunalResolved: (payload, receipt = null) =>
    commitWithReceipt(receipt, set, (current) => {
      const patch = applyTribunalResolvedPure(current, payload)
      if (patch === current) return current
      if (patch.state?.phase !== "NIGHT") return patch
      return {
        ...patch,
        state: { ...patch.state, ...clearSelfActed(patch.state) },
        ...clearPrivateOnNightEntry(current),
        ...clearOnNightEntry(current.state, patch.state),
      }
    }),
})
