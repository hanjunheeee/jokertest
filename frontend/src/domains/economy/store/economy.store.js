// F-08 서버 경제 상태 클라이언트. 상점·기억의 서고·마이페이지가 공통으로 보는 잔액·
// 소유품·장착 상태를 backend/routes/economy.routes.js에서 복원한다. 도메인 관례상 API
// 호출은 별도 *.api.js로 감싸지만, 이 작업의 계획된 새 파일은 이 store 하나뿐이라(수정
// 범위 문서) fetch 호출을 이 파일 안에 그대로 둔다.
//
// R-IMPL(2026-09-10, 반송) 대응 — 계정 격리: 이전 버전은 로그아웃/계정 전환에 전혀
// 반응하지 않았다. 로그아웃해도 이전 계정의 잔액·소유품·pendingPurchases가 그대로 남고,
// 이전 계정에 대한 fetch/purchase/equip 응답이 나중에 도착하면(응답 유실 후 지연 도착 등)
// 그 사이 로그인한 다음 계정의 상태를 덮어쓸 수 있었다. requestGeneration을 계정
// 전환/로그아웃마다 증가시키고, 모든 비동기 완료 지점에서 "요청을 시작한 시점의
// generation"과 "지금 generation"을 비교해 다르면(그 사이 계정이 바뀌었다면) 응답을
// 조용히 버린다 — 어느 계정이 요청했는지와 무관하게, 지금 로그인된 계정과 다른 데이터로
// 화면을 덮어쓰는 일을 막는다.
import { create } from "zustand"

import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

const initialLoadout = {
  selectedProfilePhotoId: null,
  selectedProfileBorderId: null,
  selectedCardFrameId: null,
}

const initialState = {
  balanceGold: 0,
  balanceDiamond: 0,
  entitlements: [],
  loadout: initialLoadout,
  status: "idle", // idle | loading | ready | error
  error: null,
  // itemId별 구매 진행 상태. referenceEventId를 유지해 응답 유실 후 재시도가 같은
  // 참조 사건 ID를 재사용하게 한다(백엔드 재처리 방지 키, F-08 AC-02) — 그래야 "성공했는지
  // 모르는 채로 재시도"해도 서버가 중복 지급하지 않는다. status는 pending(진행 중)|
  // confirmed(서버가 성공 응답)|rejected(서버가 명시적으로 거부, code 있음)|unknown(응답을
  // 받지 못함 — 성공/실패를 알 수 없는 전송 불확실 상태) 중 하나다.
  pendingPurchases: {},
}

const resolveUserId = () => useAuthStore.getState().user?.uuid ?? null

const buildReferenceEventId = (userId, itemId) =>
  `purchase:${userId}:${itemId}:${crypto.randomUUID()}`

export const useEconomyStore = create((set, get) => ({
  ...initialState,
  requestGeneration: 0,
  // F-13 AC-02 재검토(CODEX-5) — requestGeneration은 계정 경계만 가른다. 같은 계정 안에서도
  // 이전 equipProfile 시도의 뒤늦은 완료(성공이든, 그로 인한 재조회든)가 그 사이 새로
  // 시작된 더 최신 시도의 결과를 덮어쓸 수 있었다(완료 순서가 응답 도착 순서에 좌우되므로).
  // equipProfile을 호출할 때마다 이 값을 올려 "지금 사용자가 실제로 원하는 최신 확정
  // 시도"를 표시하고, loadout을 실제로 쓰는 모든 지점(equipProfile 자신의 성공 처리·
  // fetchSummary)이 자신이 시작된 이후 더 최신 시도가 생기지 않았을 때만 반영한다 — 오직
  // 가장 나중에 "시작된" 시도만 loadout을 쓸 자격이 있다(완료 순서가 아니라 시작 순서로
  // 승자를 가른다).
  loadoutAttemptSeq: 0,
  summaryRequestSeq: 0,
  loadoutWriteSeq: 0,

  /** 지갑 잔액·소유품·장착 상태를 서버에서 다시 읽어온다. */
  fetchSummary: async () => {
    const userId = resolveUserId()
    if (!userId) {
      set({ status: "error", error: "로그인이 필요합니다." })
      return
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
      // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐다면, 이 응답은 더 이상
      // "현재 계정"의 것이 아니다 — 화면 상태를 덮어쓰지 않고 조용히 버린다.
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return
      // F-13 AC-02(CODEX-6): 이 조회가 시작된 뒤 equipProfile로 더 최신 확정 시도가
      // 시작됐다면, 이 조회가 함께 받아온 loadout은 그 시도보다 오래된 정보일 수 있다 —
      // loadout만 덮어쓰지 않는다(그 최신 시도 자신의 완료가 진실을 확정한다). 지갑·소유품은
      // equipProfile이 바꾸는 값이 아니므로 loadout과 달리 보호가 필요 없다 — 같은 계정의
      // 유효한 조회 결과라면 그대로 반영하고 status도 "ready"까지 정상 종료한다(loadout
      // 하나만 보류할 뿐, summary 전체를 폐기하면 status가 "loading"에 멈춰 남는다).
      set((state) => ({
        balanceGold: wallet.balanceGold,
        balanceDiamond: wallet.balanceDiamond,
        entitlements: entitlementsResponse.entitlements,
        loadout: state.loadoutAttemptSeq === attemptSeq && state.loadoutWriteSeq === writeSeq ? entitlementsResponse.loadout : state.loadout,
        status: "ready",
        error: null,
      }))
    } catch (error) {
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return
      set({ status: "error", error: error.message ?? "지갑 정보를 불러오지 못했습니다." })
    }
  },

  /** 마지막 실패를 그대로 다시 시도한다. */
  retry: () => get().fetchSummary(),

  /** @param {{ itemId: string }} params */
  purchase: async ({ itemId }) => {
    const userId = resolveUserId()
    if (!userId) throw new Error("로그인이 필요합니다.")

    const generation = get().requestGeneration
    const existingPending = get().pendingPurchases[itemId]
    // 응답 유실(전송 불확실, status "unknown")로 남은 대기만 같은 참조 사건 ID를
    // 재사용한다 — 서버가 이미 확정적으로 거부한(rejected) 시도는 결과가 이미 확정됐으므로
    // 다음 시도는 새 참조 사건 ID로 취급한다.
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

      // backend/utils/appError.js의 createError는 서버가 실제로 처리해 거부한 응답에
      // 항상 code를 싣는다(handleApiResponse/toApiError, shared/api/response.js). code가
      // 있으면 "서버가 응답했고 명시적으로 거부했다"는 확정된 사실이고, code가 없으면
      // fetch 자체가 실패했거나(네트워크 단절 등 TypeError) 응답을 받지 못한 것이라
      // 성공/실패를 알 수 없는 전송 불확실 상태다 — 이 둘을 구분해야 재시도 전략(같은
      // 참조 사건 ID 재사용 여부)이 달라진다(F-08 R-IMPL: "distinguish confirmed server
      // rejection from transport uncertainty").
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

  /** 응답을 잃어버렸거나(unknown) 거부된(rejected) 구매를 다시 시도한다. unknown이면
   *  같은 참조 사건 ID를 재사용하고, rejected면 새 시도로 취급해 새 참조 사건 ID를 쓴다. */
  retryPurchase: (itemId) => get().purchase({ itemId }),

  /** @param {{ slot: "PROFILE_PHOTO" | "PROFILE_BORDER" | "PLAYER_CARD_FRAME", itemId: string }} params */
  equip: async ({ slot, itemId }) => {
    const generation = get().requestGeneration
    const result = await api.post("/economy/equip", { slot, itemId })
    if (get().requestGeneration !== generation) return result
    set((state) => ({ loadout: { ...state.loadout, ...result.loadout }, loadoutWriteSeq: state.loadoutWriteSeq + 1 }))
    return result
  },

  /** F-13 AC-01/AC-02: 프로필 수정 모달의 확인 한 번을 사진·테두리 동시 확정 요청 하나로
   *  보낸다. 실제로 바뀐 슬롯만 넘기면 되고(다른 슬롯은 undefined로 넘겨 건드리지 않는다),
   *  서버가 두 슬롯을 함께 검증·저장한 뒤 돌려준 loadout만 반영한다 — 실패하면(한쪽이라도
   *  미보유/종류 불일치) 아무 것도 반영하지 않고 그대로 던진다(이전 장착 상태 유지, equip과
   *  같은 generation 가드).
   *  @param {{ photoItemId?: string, borderItemId?: string }} params */
  equipProfile: async ({ photoItemId, borderItemId }) => {
    const generation = get().requestGeneration
    // F-13 AC-02(CODEX-5): 이 호출을 "지금 사용자가 원하는 최신 확정 시도"로 등록한다 —
    // 이후 이 값이 다시 바뀌면(더 새로운 equipProfile 호출이 시작되면) 이 시도의 응답은
    // 도착 순서와 무관하게 loadout을 쓸 자격을 잃는다(같은 화면 안에서의 낙관적 갱신
    // 규칙 — 클라이언트가 "지금 보여줄 값"을 정하는 용도일 뿐이다).
    const attemptSeq = get().loadoutAttemptSeq + 1
    set({ loadoutAttemptSeq: attemptSeq })
    // F-13 AC-02 설계 감사(운영자, 2026-09-11) — 이전에는 이 시점에 clientIntentAt(Date.now())을
    // 함께 보내 서버가 겹치는 확정들의 커밋 순서를 재구성하도록 시도했으나, 벽시계는 전순서가
    // 아니고(같은 밀리초 충돌), 시계 역행/오차가 정당한 요청을 거부하며, 그 판정을 지탱하던
    // 서버 인메모리 상태는 재시작·다중 인스턴스에서 사라진다는 세 가지 결함이 있어 제거했다
    // (backend/service/economy.service.js의 equipProfileAppearance 주석 참고). 화면에 무엇을
    // 보여줄지는 여전히 위 attemptSeq만으로 완전히 결정된다 — 같은 탭에서 이 호출보다 더
    // 나중에 시작된 확정이 있으면, 이 호출의 응답이 어떤 순서로 도착하든 store.loadout에
    // 반영될 자격이 없다(아래 두 재확인). 서버는 행 잠금(equipProfileAppearance)으로 겹치는
    // 두 확정의 갱신 자체만 원자적으로 직렬화할 뿐, 어느 쪽이 "의도상 더 나중"인지는 더 이상
    // 판단하지 않는다 — 실제 네트워크 재정렬로 커밋 순서가 뒤바뀌는 것은 극히 드물고, 그런
    // 잔여 불일치는 다음 자연스러운 재조회(편집기 재오픈·새로고침)에서 스스로 바로잡힌다.
    const result = await api.post("/economy/equip-profile", { photoItemId, borderItemId })
    if (get().requestGeneration !== generation) return result
    if (get().loadoutAttemptSeq !== attemptSeq) return result
    set((state) => ({ loadout: { ...state.loadout, ...result.loadout }, loadoutWriteSeq: state.loadoutWriteSeq + 1 }))
    return result
  },

  /** 계정 경계를 넘는 모든 상태를 지우고 진행 중이던 요청들을 전부 무효화한다
   *  (requestGeneration 증가) — 그 뒤에 도착하는 이전 계정의 응답은 전부 무시된다. */
  reset: () => set((state) => ({
    ...initialState,
    pendingPurchases: {},
    requestGeneration: state.requestGeneration + 1,
  })),
}))

// 로그아웃(user → null)이든 다른 계정으로 전환(uuid 변경)이든, 계정 식별자가 바뀌는
// 순간 즉시 리셋한다 — 화면이 다시 fetchSummary를 부르기 전까지 이전 계정의 잔액·소유품이
// 그대로 보이거나, 전환 도중이던 요청이 새 계정 화면에 뒤늦게 반영되는 것을 막는다.
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useEconomyStore.getState().reset()
  }
})
