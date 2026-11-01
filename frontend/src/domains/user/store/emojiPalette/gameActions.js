// 이모티콘 팔레트 스토어의 인게임 팔레트 불러오기·비우기 (판마다 한 번, 같은 판 요청은 하나로 합침)
// emojiPalette.store.js가 create 안에서 펼쳐 쓰고, 초기화가 clearGameRequest를 씀
import { getEmojiPaletteApi } from "../../api/emojiPalette.api.js"
import {
  inGameEmojiScopeKey,
  readInGameEmojiScope,
} from "../../../game/ingame/utils/selectInGameEmojiScope.js"
import { normalizeSlots } from "../../utils/emoticonPalette/slots.js"

let gamePendingKey = null
let gamePendingPromise = null

let gamePendingToken = null
let gameRequestSeq = 0

export function clearGameRequest() {
  gamePendingKey = null
  gamePendingPromise = null
  gamePendingToken = null
}

export const gameActions = (set, get) => ({
  // 지금 판이 아니면 거절, 이미 받은 판이면 저장값, 받는 중이면 그 요청을 같이 기다림
  loadForGame: async (scope = null) => {
    const liveScope = readInGameEmojiScope()
    const key = inGameEmojiScopeKey(liveScope)
    if (key === null) return { ok: false, code: "NO_GAME_SCOPE" }
    if (scope !== null && inGameEmojiScopeKey(scope) !== key) return { ok: false, stale: true }

    const current = get()
    if (current.gameScopeKey === key && current.gameStatus === "ready") {
      return { ok: true, cached: true, slots: current.gameSlots }
    }
    if (gamePendingKey === key && gamePendingPromise !== null) return gamePendingPromise

    clearGameRequest()
    gameRequestSeq += 1
    const token = gameRequestSeq
    gamePendingKey = key
    gamePendingToken = token
    set({ gameScopeKey: key, gameStatus: "loading", gameSlots: null })

    // 그사이 다른 요청이 시작됐거나 판이 바뀌었으면 응답을 버림
    const isCurrent = () => gamePendingToken === token
      && inGameEmojiScopeKey(readInGameEmojiScope()) === key
      && get().gameScopeKey === key

    const pending = (async () => {
      try {
        const response = await getEmojiPaletteApi()
        if (!isCurrent()) return { ok: false, stale: true }
        const slots = normalizeSlots(response?.slots)
        set({ gameSlots: slots, gameStatus: "ready" })
        return { ok: true, slots }
      } catch (error) {
        if (!isCurrent()) return { ok: false, stale: true }
        set({ gameStatus: "error" })
        return { ok: false, code: error?.code, error }
      } finally {
        if (gamePendingToken === token) clearGameRequest()
      }
    })()

    gamePendingPromise = pending
    return pending
  },

  // 이미 비어 있으면 상태를 그대로 둬서 구독자를 다시 부르지 않음
  resetGamePalette: () => {
    clearGameRequest()
    set((state) => {
      if (state.gameScopeKey === null && state.gameSlots === null && state.gameStatus === "idle") {
        return state
      }
      return { gameSlots: null, gameScopeKey: null, gameStatus: "idle" }
    })
  },
})
