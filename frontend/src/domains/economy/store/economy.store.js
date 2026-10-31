import { create } from "zustand"

import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

const initialLoadout = {
  selectedProfilePhotoId: null,
  selectedProfileBorderId: null,
  selectedCardFrameId: null,
  selectedSkinsByJob: null,
  revision: null,
}

const initialState = {
  balanceGold: 0,
  balanceDiamond: 0,
  entitlements: [],
  loadout: initialLoadout,
  status: "idle", // idle | loading | ready | error
  error: null,
  pendingPurchases: {},
}

const resolveUserId = () => useAuthStore.getState().user?.uuid ?? null

const JOB_SKIN_SLOT_TO_JOB_ID = Object.freeze({
  JOB_SKIN_NOBLE: "noble",
  JOB_SKIN_CLOWN: "clown",
  JOB_SKIN_GUARD: "guard",
  JOB_SKIN_DOCTOR: "doctor",
  JOB_SKIN_WITCH_HUNTER: "witchHunter",
})

const buildReferenceEventId = (userId, itemId) =>
  `purchase:${userId}:${itemId}:${crypto.randomUUID()}`

let loadoutQueue = null

const MAX_LOADOUT_EQUIP_AUTO_RETRIES = 2

const SLOT_TO_LOADOUT_FIELD = Object.freeze({
  PROFILE_PHOTO: "selectedProfilePhotoId",
  PROFILE_BORDER: "selectedProfileBorderId",
  PLAYER_CARD_FRAME: "selectedCardFrameId",
})

const sendLoadoutWrite = (get, set, {
  endpoint, buildBody, matches, applyExtra, conflictCode,
  requireKnownRevision = false, replayOnConflict = true,
}) => {
  const generation = get().requestGeneration
  const userId = resolveUserId()
  const isCurrent = () => Boolean(userId) && generation === get().requestGeneration && userId === resolveUserId()
  const sessionChangedError = () => Object.assign(new Error("계정이 변경되어 저장을 취소했습니다."), { code: "SESSION_CHANGED" })

  const applyLoadoutResult = (loadout, { withExtra = true } = {}) => {
    if (!isCurrent()) return
    set((state) => {
      const merged = { ...state.loadout, ...loadout }
      return {
        loadout: (withExtra && applyExtra) ? { ...merged, ...applyExtra(merged) } : merged,
        loadoutWriteSeq: state.loadoutWriteSeq + 1,
      }
    })
  }

  const fetchAuthoritativeLoadout = async () => {
    if (!isCurrent()) throw sessionChangedError()
    const entitlementsResponse = await api.get(`/economy/accounts/${userId}/entitlements`)
    if (!isCurrent()) throw sessionChangedError()
    return entitlementsResponse.loadout
  }

  const attemptSend = async (expectedRevision, attemptNumber) => {
    if (!isCurrent()) throw sessionChangedError()
    try {
      const result = await api.post(endpoint, buildBody(expectedRevision))
      applyLoadoutResult(result.loadout)
      return result
    } catch (error) {
      if (!isCurrent()) throw error

      const code = error?.code
      if (code !== conflictCode || attemptNumber > MAX_LOADOUT_EQUIP_AUTO_RETRIES) throw error

      let serverLoadout
      try {
        serverLoadout = await fetchAuthoritativeLoadout()
      } catch {
        throw error
      }
      if (!isCurrent()) throw sessionChangedError()

      applyLoadoutResult(serverLoadout, { withExtra: false })

      if (matches(serverLoadout)) {
        return { loadout: serverLoadout, reconciled: true }
      }

      if (!replayOnConflict) {
        throw error
      }

      return attemptSend(serverLoadout.revision, attemptNumber + 1)
    }
  }

  const run = async () => {
    let revision = get().loadout.revision
    if (requireKnownRevision && (typeof revision !== "string" || revision.length === 0)) {
      if (!isCurrent()) throw sessionChangedError()
      let authoritative
      try {
        authoritative = await fetchAuthoritativeLoadout()
      } catch {
        if (!isCurrent()) throw sessionChangedError()
        throw Object.assign(
          new Error("장착 상태를 아직 불러오지 못해 저장할 수 없습니다. 다시 시도해 주세요."),
          { code: "LOADOUT_REVISION_UNAVAILABLE" },
        )
      }
      if (!isCurrent()) throw sessionChangedError()
      applyLoadoutResult(authoritative, { withExtra: false })
      revision = authoritative.revision
    }
    return attemptSend(revision, 1)
  }
  const result = loadoutQueue ? loadoutQueue.then(run) : run()
  const settled = result.then(() => undefined, () => undefined)
  loadoutQueue = settled
  settled.then(() => { if (loadoutQueue === settled) loadoutQueue = null })
  return result
}

export const useEconomyStore = create((set, get) => ({
  ...initialState,
  requestGeneration: 0,
  loadoutAttemptSeq: 0,
  summaryRequestSeq: 0,
  loadoutWriteSeq: 0,

  fetchSummary: async () => {
    const userId = resolveUserId()
    if (!userId) {
      set({ status: "error", error: "로그인이 필요합니다." })
      return { ok: false }
    }

    const generation = get().requestGeneration
    const attemptSeq = get().loadoutAttemptSeq
    const writeSeq = get().loadoutWriteSeq
    const summarySeq = get().summaryRequestSeq + 1
    set({ summaryRequestSeq: summarySeq, status: "loading", error: null })
    try {
      const [wallet, entitlementsResponse] = await Promise.all([
        api.get(`/economy/accounts/${userId}/wallet`),
        api.get(`/economy/accounts/${userId}/entitlements`),
      ])
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return { ok: false, stale: true }
      const loadoutApplied = get().loadoutAttemptSeq === attemptSeq && get().loadoutWriteSeq === writeSeq
      set((state) => ({
        balanceGold: wallet.balanceGold,
        balanceDiamond: wallet.balanceDiamond,
        entitlements: entitlementsResponse.entitlements,
        loadout: state.loadoutAttemptSeq === attemptSeq && state.loadoutWriteSeq === writeSeq ? entitlementsResponse.loadout : state.loadout,
        status: "ready",
        error: null,
      }))
      return { ok: loadoutApplied, stale: !loadoutApplied, loadout: loadoutApplied ? entitlementsResponse.loadout : undefined }
    } catch (error) {
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return { ok: false, stale: true }
      set({ status: "error", error: error.message ?? "지갑 정보를 불러오지 못했습니다." })
      return { ok: false, error }
    }
  },

  retry: () => get().fetchSummary(),

  purchase: async ({ itemId }) => {
    const userId = resolveUserId()
    if (!userId) throw new Error("로그인이 필요합니다.")

    const generation = get().requestGeneration
    const existingPending = get().pendingPurchases[itemId]
    const referenceEventId = existingPending?.status === "unknown"
      ? existingPending.referenceEventId
      : buildReferenceEventId(userId, itemId)

    set((state) => ({
      pendingPurchases: {
        ...state.pendingPurchases,
        [itemId]: { referenceEventId, status: "pending", error: null, code: null },
      },
    }))

    try {
      const result = await api.post("/economy/purchase", { itemId, referenceEventId })
      if (get().requestGeneration !== generation) return result
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: { referenceEventId, status: "confirmed", error: null, code: null },
        },
      }))
      await get().fetchSummary()
      return result
    } catch (error) {
      if (get().requestGeneration !== generation) throw error

      const confirmedRejection = typeof error.code === "string" && error.code.length > 0
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: {
            referenceEventId,
            status: confirmedRejection ? "rejected" : "unknown",
            error: error.message ?? (confirmedRejection ? "구매가 거부되었습니다." : "구매 요청에 실패했습니다."),
            code: confirmedRejection ? error.code : null,
          },
        },
      }))
      throw error
    }
  },

  retryPurchase: (itemId) => get().purchase({ itemId }),

  equip: ({ slot, itemId }) => {
    const jobId = JOB_SKIN_SLOT_TO_JOB_ID[slot]
    const field = jobId ? null : SLOT_TO_LOADOUT_FIELD[slot]
    const isSkinOrCardSlot = Boolean(jobId) || slot === "PLAYER_CARD_FRAME"
    return sendLoadoutWrite(get, set, {
      endpoint: "/economy/equip",
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

  equipProfile: ({ photoItemId, borderItemId }) => {
    set((state) => ({ loadoutAttemptSeq: state.loadoutAttemptSeq + 1 }))
    return sendLoadoutWrite(get, set, {
      endpoint: "/economy/equip-profile",
      buildBody: (expectedRevision) => ({ photoItemId, borderItemId, expectedRevision }),
      matches: (serverLoadout) => (
        (photoItemId === undefined || serverLoadout.selectedProfilePhotoId === photoItemId)
        && (borderItemId === undefined || serverLoadout.selectedProfileBorderId === borderItemId)
      ),
      conflictCode: "PROFILE_REVISION_CONFLICT",
    })
  },

  reset: () => {
    loadoutQueue = null
    set((state) => ({
    ...initialState,
    pendingPurchases: {},
    requestGeneration: state.requestGeneration + 1,
  }))
  },
}))

useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useEconomyStore.getState().reset()
  }
})
