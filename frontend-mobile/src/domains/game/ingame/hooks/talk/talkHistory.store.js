// 채팅방 기록 저장소: 시스템 알림·받은 이모티콘을 판 단위로 보관
// useSystemNotices·useEmojiHistory가 씀, 화면 회전·재판으로 채팅방이 다시 그려져도 기록이 안 날아가게 화면 밖에 둠
import { create } from "zustand"

// 오래 하면 끝없이 늘지 않게 최근 것만
const MAX_LINES = 40

const EMPTY_GAME = { notices: [], emojis: [], prevPlayers: null }

export const useTalkHistoryStore = create((set, get) => ({
    gameId: null,
    ...EMPTY_GAME,

    // 판이 바뀌었으면 기록 비우고 새 판으로 (같은 판이면 그대로)
    ensureGame(gameId) {
        if (get().gameId === gameId) return
        set({ gameId, ...EMPTY_GAME })
    },

    // 명단 바뀜 기록: 이전 명단을 돌려주고 새 명단을 기억 (알림 계산은 부르는 쪽)
    swapPlayers(players) {
        const previous = get().prevPlayers
        set({ prevPlayers: players })
        return previous
    },

    addNotices(notices) {
        if (notices.length === 0) return
        set((state) => ({ notices: [...state.notices, ...notices].slice(-MAX_LINES) }))
    },

    addEmojis(emojis) {
        set((state) => {
            const known = new Set(state.emojis.map((emoji) => emoji.id))
            const fresh = emojis.filter((emoji) => !known.has(emoji.id))
            return fresh.length === 0 ? state : { emojis: [...state.emojis, ...fresh].slice(-MAX_LINES) }
        })
    },
}))
