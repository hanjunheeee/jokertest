// 경제 스토어의 아이템 장착·프로필 장착 액션과 초기화
// economy.store.js가 create 안에서 펼쳐 씀
import { economyApi } from "../../api/economy.api.js"
import { JOB_SKIN_SLOT_TO_JOB_ID, SLOT_TO_LOADOUT_FIELD } from "../../constants/loadout.js"
import { clearLoadoutQueue, sendLoadoutWrite } from "./loadoutWrite.js"
import { initialState } from "./state.js"

export const loadoutActions = (set, get) => ({
  // 직업 스킨·카드 칸은 버전을 꼭 붙이고 충돌 때 다시 보내지 않음
  equip: ({ slot, itemId }) => {
    const jobId = JOB_SKIN_SLOT_TO_JOB_ID[slot]
    const field = jobId ? null : SLOT_TO_LOADOUT_FIELD[slot]
    const isSkinOrCardSlot = Boolean(jobId) || slot === "PLAYER_CARD_FRAME"
    return sendLoadoutWrite(get, set, {
      send: economyApi.equip,
      buildBody: (expectedRevision) => (isSkinOrCardSlot
        ? { slot, itemId, expectedRevision }
        : { slot, itemId, ...(expectedRevision ? { expectedRevision } : {}) }),
      applyExtra: jobId
        ? (merged) => ({ selectedSkinsByJob: { ...merged.selectedSkinsByJob, [jobId]: itemId } })
        : undefined,
      matches: (serverLoadout) => (jobId
        ? (serverLoadout.selectedSkinsByJob?.[jobId] ?? null) === itemId
        : field
          ? serverLoadout[field] === itemId
          : false),
      conflictCode: "SKIN_REVISION_CONFLICT",
      requireKnownRevision: isSkinOrCardSlot,
      replayOnConflict: !isSkinOrCardSlot,
    })
  },

  // 시도 순번을 올려 그사이 온 요약 응답이 장착 상태를 덮지 않게 함
  equipProfile: ({ photoItemId, borderItemId }) => {
    set((state) => ({ loadoutAttemptSeq: state.loadoutAttemptSeq + 1 }))
    return sendLoadoutWrite(get, set, {
      send: economyApi.equipProfile,
      buildBody: (expectedRevision) => ({ photoItemId, borderItemId, expectedRevision }),
      matches: (serverLoadout) => (
        (photoItemId === undefined || serverLoadout.selectedProfilePhotoId === photoItemId)
        && (borderItemId === undefined || serverLoadout.selectedProfileBorderId === borderItemId)
      ),
      conflictCode: "PROFILE_REVISION_CONFLICT",
    })
  },

  // 세대를 올려 진행 중인 요청 결과를 전부 버림
  reset: () => {
    clearLoadoutQueue()
    set((state) => ({
      ...initialState,
      pendingPurchases: {},
      requestGeneration: state.requestGeneration + 1,
    }))
  },
})
