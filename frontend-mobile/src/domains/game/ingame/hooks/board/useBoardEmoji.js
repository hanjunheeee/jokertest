// 카드 판 이모티콘: 판 범위 키·인게임 팔레트 불러오기·팔레트 열림 상태
// Board가 씀 (데스크톱 InGamePlayerBoard 안 effect 두 개를 그대로 옮김)
import { useCallback, useEffect, useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
    inGameEmojiScopeKey,
    readEmojiScope,
    selectInGameEmojiScope,
} from "@/domains/game/ingame/utils/selectInGameEmojiScope.js"
import { useEmojiPaletteStore } from "@/domains/user/store/emojiPalette.store.js"

// 팔레트 칸·열기·닫기 (내 판이 아니면 canOpen false)
export function useBoardEmoji() {
    const slots = useEmojiPaletteStore((state) => state.gameSlots)
    const gameId = useInGameStore((state) => state.gameId)
    const gameState = useInGameStore((state) => state.state)
    const authUuid = useAuthStore((state) => state.user?.uuid ?? null)
    const identityGeneration = useAuthStore((state) => state.identityGeneration ?? null)
    const scopeKey = inGameEmojiScopeKey(
        selectInGameEmojiScope({ gameId, state: gameState }, authUuid, identityGeneration),
    )

    // 팔레트를 연 범위 키 (범위가 바뀌면 자동으로 닫힌 것으로 봄)
    const [openScopeKey, setOpenScopeKey] = useState(null)

    // 판 범위가 생기거나 바뀌면 그 판 팔레트 불러옴
    useEffect(() => {
        if (scopeKey === null) return
        useEmojiPaletteStore.getState().loadForGame(readEmojiScope())
    }, [scopeKey])

    const canOpen = scopeKey !== null
    const open = canOpen && openScopeKey === scopeKey

    // 내 판일 때만 엶
    const openPalette = useCallback(() => {
        if (scopeKey === null) return
        setOpenScopeKey(scopeKey)
    }, [scopeKey])

    const closePalette = useCallback(() => setOpenScopeKey(null), [])

    return { slots: slots ?? [], canOpen, open, openPalette, closePalette }
}
