// F-33 E-2(설계도 §2-2): 마이페이지 이모티콘 팔레트 상태. economy.store.js와 같은
// requestGeneration 패턴을 쓰되, 계정 경계 판정만 다르다.
//
// economy.store.js는 useAuthStore를 구독해 user.uuid가 바뀔 때만 reset한다. 그러면 같은
// 계정으로 로그아웃 후 다시 로그인한 경우(uuid는 그대로, 그 사이에 분명히 다른 신원 구간이
// 있었다)를 걸러내지 못한다 — auth.store.js의 identityGeneration은 로그인·로그아웃마다
// 단조 증가하는 "전이 횟수"라 A→B→A도 드러낸다. 이 store는 그 값 자체의 변화를 본다.
//
// 편집 중인 값(selectedSlots)은 화면이 아니라 이 store가 소유한다 — 페이지가 별도 useState로
// 들고 있으면 저장 실패(409)로 서버 값이 갱신될 때 화면과 store가 서로 다른 팔레트를
// 가리키게 된다.
import { create } from "zustand"

import { getEmojiPaletteApi, saveEmojiPaletteApi } from "../api/emojiPalette.api.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
// E-3(F-33 AC-03): 인게임 팔레트 스냅샷의 유효 범위·무효화 시점 판정. 인게임 store를 직접
// 구독해야 하는 이유는 아래 loadForGame 주석에 있다(subscribeInGameIdentityScope 하나로는
// 판 종료·이탈을 알 수 없다).
import {
  inGameEmojiScopeKey,
  readInGameEmojiScope,
} from "../../game/ingame/utils/selectInGameEmojiScope.js"
import { useInGameStore } from "../../game/ingame/store/ingameStore.js"

export const EMOJI_PALETTE_SLOT_COUNT = 8

const emptySlots = () => Array.from({ length: EMOJI_PALETTE_SLOT_COUNT }, () => null)

/** 서버가 준 slots를 화면이 그대로 믿을 수 있는 8칸 배열로 정규화한다 — 길이가 다르거나
 *  배열이 아니면(계약 위반 응답) 빈 칸으로 채운다. 화면은 이 배열의 길이가 항상 8이라고
 *  전제하고 렌더한다. slots[i]는 (i+1)번 슬롯(12시=1번, 시계 방향) — emoticonPaletteSlots.js. */
const normalizeSlots = (slots) => {
  const base = emptySlots()
  if (!Array.isArray(slots)) return base
  return base.map((_, index) => {
    const value = slots[index]
    return typeof value === "string" && value.length > 0 ? value : null
  })
}

const createInitialState = () => ({
  // 서버가 마지막으로 확인해 준 값(취소가 되돌아갈 자리).
  slots: emptySlots(),
  revision: null,
  owned: [],
  // 편집 중인 값. 저장 전까지 서버에 보내지 않는다.
  selectedSlots: emptySlots(),
  selectedSlotIndex: 0,
  status: "idle", // idle | loading | ready | error
  error: null,
  // 마지막 저장이 409로 거부됐을 때 서버가 알려준 현재 값. 화면의 충돌 안내 근거다.
  conflict: null,
  // ── E-3(F-33 AC-03): 인게임 팔레트 스냅샷 ────────────────────────────────
  //
  // 위 편집 상태(slots/selectedSlots)와 **완전히 분리된** 사본이다. 한 판이 도는 동안에는
  // 마이페이지에서 무엇을 저장해도 이 값이 바뀌지 않아야 한다 — 서버의 판정 근거도 게임 시작
  // 때 캡처한 세션 캐시라, 화면이 그보다 새로운 배치를 보여 주면 보낼 수 없는 칸을 누르게 된다.
  gameSlots: null,
  gameScopeKey: null,
  gameStatus: "idle", // idle | loading | ready | error
})

// 같은 scope의 진행 중 요청. 상태 트리 밖에 두는 이유는 Promise가 직렬화 가능한 화면 값이
// 아니고, StrictMode의 이중 effect가 **같은 틱에** 두 번 부르는 것을 합치려면 set()이 커밋되기
// 전에도 보여야 하기 때문이다.
let gamePendingKey = null
let gamePendingPromise = null

/**
 * **요청 하나를 가리키는 토큰.** 키만으로는 "지금 살아 있는 요청인가"를 답할 수 없다.
 *
 * 키 비교만 하면 이런 순서가 통과한다: 요청 A(키 K)가 날아간 사이 무효화(resetGamePalette)가
 * 일어나고, 같은 판으로 다시 들어와 요청 B(같은 키 K)가 시작된다. 이때 A가 응답하면 키도
 * gameScopeKey도 전부 K라 A는 자기가 최신인 줄 알고 B의 슬롯을 덮어쓰고(폐기했어야 할 응답이
 * 새 캐시가 된다), A의 finally는 키가 같다는 이유로 **B의 pending 토큰까지 지워** 중복 방지가
 * 풀린다(같은 판에서 GET이 한 번 더 나간다).
 *
 * 그래서 요청마다 단조 증가하는 토큰을 발급하고, 응답을 반영할지(isCurrent)와 pending을
 * 정리할지(finally)를 **그 토큰이 아직 현재 요청인가**로만 판정한다. 무효화는 토큰을 null로
 * 만들므로, 그 시점 이후 도착하는 응답은 재진입 여부와 무관하게 전부 버려진다.
 */
let gamePendingToken = null
let gameRequestSeq = 0

function clearGamePaletteRequest() {
  gamePendingKey = null
  gamePendingPromise = null
  gamePendingToken = null
}

export const useEmojiPaletteStore = create((set, get) => ({
  ...createInitialState(),
  requestGeneration: 0,

  /** 서버 값을 읽어 편집 상태까지 초기화한다. 거부(reject)는 반드시 여기서 잡는다 —
   *  놓치면 페이지의 진입 효과가 처리되지 않은 rejection을 만든다. */
  load: async () => {
    set({ status: "loading", error: null, conflict: null })
    const generation = get().requestGeneration
    const identityGeneration = useAuthStore.getState().identityGeneration
    // 요청이 끝났을 때 "그 사이 계정이 바뀌지 않았고, reset도 없었는가"를 함께 본다.
    const isCurrent = () => get().requestGeneration === generation
      && useAuthStore.getState().identityGeneration === identityGeneration

    try {
      const response = await getEmojiPaletteApi()
      if (!isCurrent()) return { ok: false, stale: true }

      const slots = normalizeSlots(response?.slots)
      set({
        slots,
        selectedSlots: [...slots],
        selectedSlotIndex: 0,
        revision: typeof response?.revision === "string" ? response.revision : null,
        owned: Array.isArray(response?.owned) ? [...response.owned] : [],
        status: "ready",
        error: null,
        conflict: null,
      })
      return { ok: true }
    } catch (error) {
      if (!isCurrent()) return { ok: false, stale: true }
      set({ status: "error", error })
      return { ok: false, code: error?.code, error }
    }
  },

  /**
   * E-3(F-33 AC-03): **이 판에 고정되는** 8칸 사본을 한 번만 읽어 둔다.
   *
   * 캐시 키는 [authUuid, identityGeneration, gameId]다(selectInGameEmojiScope). 그래서
   *   - StrictMode의 이중 effect와 같은 판의 보드 재마운트는 진행 중 Promise/완료 스냅샷을
   *     그대로 재사용해 GET을 추가로 내지 않는다,
   *   - 소켓 재연결·effect cleanup·일반 snapshot 갱신도 키를 바꾸지 않으므로 캐시가 유지된다,
   *   - 계정 교체·로그아웃(identityGeneration)·다음 gameId만 새 요청을 만든다.
   *
   * 호출부가 넘긴 scope는 **주장**일 뿐이라, 지금의 canonical scope와 다르면 그 요청은 이미
   * 지난 것으로 보고 조회하지 않는다(fail-closed). scope를 생략하면 지금 값을 그대로 쓴다.
   */
  loadForGame: async (scope = null) => {
    const liveScope = readInGameEmojiScope()
    const key = inGameEmojiScopeKey(liveScope)
    // 유효한 판이 없으면 슬롯을 노출하지 않는다(있던 캐시도 아래 구독이 이미 비웠다).
    if (key === null) return { ok: false, code: "NO_GAME_SCOPE" }
    if (scope !== null && inGameEmojiScopeKey(scope) !== key) return { ok: false, stale: true }

    const current = get()
    if (current.gameScopeKey === key && current.gameStatus === "ready") {
      return { ok: true, cached: true, slots: current.gameSlots }
    }
    if (gamePendingKey === key && gamePendingPromise !== null) return gamePendingPromise

    clearGamePaletteRequest()
    gameRequestSeq += 1
    const token = gameRequestSeq
    gamePendingKey = key
    gamePendingToken = token
    // 다른 판으로 넘어온 경우 이전 사본을 여기서 버린다(두 판의 배치가 섞이지 않게 한다).
    set({ gameScopeKey: key, gameStatus: "loading", gameSlots: null })

    // 토큰을 **먼저** 본다 — 키·gameScopeKey가 모두 같아도 그 사이 폐기된 요청이면 남의 자리다.
    const isCurrent = () => gamePendingToken === token
      && inGameEmojiScopeKey(readInGameEmojiScope()) === key
      && get().gameScopeKey === key

    const pending = (async () => {
      try {
        const response = await getEmojiPaletteApi()
        // 늦게 도착한 응답은 버린다 — 그 사이 계정·판이 바뀌었으면 이 값은 남의 팔레트다.
        if (!isCurrent()) return { ok: false, stale: true }
        const slots = normalizeSlots(response?.slots)
        set({ gameSlots: slots, gameStatus: "ready" })
        return { ok: true, slots }
      } catch (error) {
        if (!isCurrent()) return { ok: false, stale: true }
        set({ gameStatus: "error" })
        return { ok: false, code: error?.code, error }
      } finally {
        // 내가 아직 현재 요청일 때만 치운다. 키로 판정하면 나를 폐기하고 시작된 **다음 요청의**
        // pending을 지워, 같은 판에서 중복 방지가 풀린다.
        if (gamePendingToken === token) clearGamePaletteRequest()
      }
    })()

    gamePendingPromise = pending
    return pending
  },

  /**
   * 인게임 사본만 버린다(마이페이지 편집 상태는 건드리지 않는다). 진행 중 요청의 토큰도 함께
   * 지워, 같은 키로 다시 들어오면 새 조회가 나갈 수 있게 한다.
   */
  resetGamePalette: () => {
    clearGamePaletteRequest()
    set((state) => {
      if (state.gameScopeKey === null && state.gameSlots === null && state.gameStatus === "idle") {
        return state
      }
      return { gameSlots: null, gameScopeKey: null, gameStatus: "idle" }
    })
  },

  /** 교체할 슬롯을 고른다. 아직 서버 값을 받지 못했으면 아무 것도 하지 않는다. */
  selectSlot: (index) => {
    if (get().status !== "ready") return
    if (!Number.isInteger(index) || index < 0 || index >= EMOJI_PALETTE_SLOT_COUNT) return
    set({ selectedSlotIndex: index })
  },

  /** 고른 슬롯을 이 이모티콘으로 교체한다.
   *
   *  같은 이모티콘이 이미 다른 칸에 있으면 그 칸과 **자리를 바꾼다**. 그냥 덮어쓰면 한
   *  팔레트에 같은 itemId가 두 번 생기고, 서버는 그 저장을 INVALID_SLOTS(중복)로 거부한다 —
   *  화면에서 만들 수 있는 배치는 언제나 저장할 수 있어야 한다. */
  assignItem: (itemId) => {
    if (get().status !== "ready") return
    if (typeof itemId !== "string" || itemId.length === 0) return

    set((state) => {
      const index = state.selectedSlotIndex
      const next = [...state.selectedSlots]
      const previous = next[index]
      const duplicateIndex = next.findIndex((value, slot) => slot !== index && value === itemId)
      next[index] = itemId
      if (duplicateIndex !== -1) next[duplicateIndex] = previous
      return { selectedSlots: next }
    })
  },

  /** 편집 중인 8칸을 서버에 저장한다. 반환값만으로 화면이 결과를 분기할 수 있게 한다. */
  save: async () => {
    if (get().status !== "ready") return { ok: false, code: "NOT_READY" }

    const generation = get().requestGeneration
    const identityGeneration = useAuthStore.getState().identityGeneration
    const isCurrent = () => get().requestGeneration === generation
      && useAuthStore.getState().identityGeneration === identityGeneration

    const slots = [...get().selectedSlots]
    const expectedRevision = get().revision

    try {
      const response = await saveEmojiPaletteApi({ slots, expectedRevision })
      if (!isCurrent()) return { ok: false, stale: true }

      const savedSlots = normalizeSlots(response?.slots ?? slots)
      const revision = typeof response?.revision === "string" ? response.revision : null
      set({ slots: savedSlots, selectedSlots: [...savedSlots], revision, conflict: null, error: null })
      return { ok: true, revision, slots: savedSlots }
    } catch (error) {
      if (!isCurrent()) return { ok: false, stale: true }

      // 409 REVISION_MISMATCH만 서버의 현재 값을 함께 준다(shared/api/response.js
      // toApiError가 Error에 싣는다) — 그 값으로 편집 상태까지 재조정해, 사용자가 곧바로
      // 최신 값 위에서 다시 고를 수 있게 한다. 다른 실패(INVALID_SLOTS·NOT_OWNED 등)는
      // 서버가 아무 것도 바꾸지 않았으므로 상태도 그대로 둔다.
      if (error?.revision !== undefined) {
        const conflictSlots = normalizeSlots(error.slots)
        set({
          slots: conflictSlots,
          selectedSlots: [...conflictSlots],
          revision: error.revision,
          conflict: { revision: error.revision, slots: conflictSlots },
        })
        return { ok: false, code: error.code, status: error.status, revision: error.revision, slots: conflictSlots }
      }
      return { ok: false, code: error?.code, status: error?.status }
    }
  },

  /** 편집을 버리고 서버에서 마지막으로 읽은 값으로 되돌린다. */
  cancel: () => {
    if (get().status !== "ready") return
    set((state) => ({ selectedSlots: [...state.slots], conflict: null }))
  },

  /** 계정 경계를 넘는 모든 상태를 지우고 진행 중이던 요청을 전부 무효화한다
   *  (requestGeneration 증가) — 그 뒤에 도착하는 이전 신원의 응답은 전부 버려진다.
   *
   *  인게임 사본과 그 진행 중 요청 토큰도 함께 지운다 — 계정이 바뀌면 그 판의 팔레트는
   *  더 이상 이 화면의 것이 아니다. */
  reset: () => {
    clearGamePaletteRequest()
    return set((state) => ({
      ...createInitialState(),
      requestGeneration: state.requestGeneration + 1,
    }))
  },
}))

// 로그인·로그아웃으로 신원 전이가 일어나는 순간 즉시 리셋한다. uuid가 아니라
// identityGeneration을 보는 이유: 같은 계정으로 다시 로그인해도(uuid 불변) 그 사이에
// 분명히 다른 신원 구간이 있었고, 전환 도중 날아간 요청이 새 화면에 뒤늦게 반영되면 안 된다.
useAuthStore.subscribe((state, prevState) => {
  if (state.identityGeneration !== prevState?.identityGeneration) {
    useEmojiPaletteStore.getState().reset()
  }
})

/**
 * E-3(F-33 AC-03): 인게임 사본의 무효화 관측.
 *
 * subscribeInGameIdentityScope 하나로는 부족하다 — 그 신호는 게임/본인/소속 **전이**만 알리고,
 * 같은 판이 끝나는 것(phase→ENDED)이나 내가 그 판에서 빠지는 것(roster isParticipating=false)을
 * 알려 주지 않는다. 그 두 경우에도 팔레트를 그대로 들고 있으면 결과 화면 뒤까지 지난 판의
 * 배치가 남는다. 그래서 canonical 상태 자체를 구독해 **캐시 키가 실제로 달라졌는가**만 본다.
 *
 * 키 비교 하나로 필요한 경우가 모두 덮인다: 종료·이탈·소유권 불일치·clearGame은 키를 null로
 * 만들고, 다음 판은 다른 키가 된다. 반대로 소켓 재연결·보드 재마운트·StrictMode cleanup·일반
 * snapshot 갱신은 키를 바꾸지 않으므로 캐시가 살아 있다(GET이 다시 나가지 않는다).
 *
 * 모듈 수명에 한 번만 등록한다(컴포넌트가 걸면 StrictMode가 구독을 다시 만든다).
 */
useInGameStore.subscribe(() => {
  const state = useEmojiPaletteStore.getState()
  // 들고 있는 것이 없으면 볼 것도 없다(모든 snapshot 갱신마다 계산하지 않는다).
  if (state.gameScopeKey === null && state.gameStatus === "idle") return
  if (inGameEmojiScopeKey(readInGameEmojiScope()) === state.gameScopeKey) return
  useEmojiPaletteStore.getState().resetGamePalette()
})
