// 이모티콘 팔레트 스토어 입구 (create·계정/판 바뀜 구독, 액션은 emojiPalette/ 아래)
// 이모티콘 팔레트 화면·인게임 보드·시험이 이 경로로 씀
import { create } from "zustand"

import { useAuthStore } from "../../auth/store/auth.store.js"
import {
  inGameEmojiScopeKey,
  readEmojiScope,
} from "../../game/ingame/utils/selectInGameEmojiScope.js"
import { useInGameStore } from "../../game/ingame/store/ingameStore.js"
import { createInitialState } from "./emojiPalette/state.js"
import { editActions } from "./emojiPalette/editActions.js"
import { gameActions } from "./emojiPalette/gameActions.js"

export { EMOJI_PALETTE_SLOT_COUNT } from "../constants/emoticonPaletteSlots.js"

export const useEmojiPaletteStore = create((set, get) => ({
  ...createInitialState(),
  requestGeneration: 0,
  ...editActions(set, get),
  ...gameActions(set, get),
}))

// 계정이 바뀌면 전부 비움
useAuthStore.subscribe((state, prevState) => {
  if (state.identityGeneration !== prevState?.identityGeneration) {
    useEmojiPaletteStore.getState().reset()
  }
})

// 판이 바뀌면 받아 둔 인게임 팔레트를 비움
useInGameStore.subscribe(() => {
  const state = useEmojiPaletteStore.getState()
  if (state.gameScopeKey === null && state.gameStatus === "idle") return
  if (inGameEmojiScopeKey(readEmojiScope()) === state.gameScopeKey) return
  useEmojiPaletteStore.getState().resetGamePalette()
})
