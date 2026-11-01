// 이모티콘 팔레트 스토어 처음 상태와 '아직 지금 요청인지' 검사
// emojiPalette.store.js와 emojiPalette/ 아래 액션 파일이 씀
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { emptySlots } from "../../utils/emoticonPalette/slots.js"

// 마이페이지 편집 값(slots·selectedSlots)과 인게임 팔레트 값(game*)을 따로 둠
export const createInitialState = () => ({
  slots: emptySlots(),
  revision: null,
  owned: [],
  selectedSlots: emptySlots(),
  selectedSlotIndex: 0,
  status: "idle",
  error: null,
  conflict: null,
  gameSlots: null,
  gameScopeKey: null,
  gameStatus: "idle",
})

// 보낸 뒤 초기화됐거나 계정이 바뀌었으면 응답을 버림
export const currentChecker = (get) => {
  const generation = get().requestGeneration
  const identityGeneration = useAuthStore.getState().identityGeneration
  return () => get().requestGeneration === generation
    && useAuthStore.getState().identityGeneration === identityGeneration
}
