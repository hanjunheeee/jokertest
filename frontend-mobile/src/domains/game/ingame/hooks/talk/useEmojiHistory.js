// 받은 이모티콘 쌓기: 말풍선 스토어는 사람마다 마지막 1개만 3초 두므로, 새로 뜰 때마다 따로 기록
// useTalkFeed가 씀, 같은 사람이 다시 보내도 sentAt이 달라 새 줄, 기록은 talkHistory 저장소에 둠
import { useEffect } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "@/domains/game/ingame/store/inGameEmojiBubble.store.js"
import { useTalkHistoryStore } from "./talkHistory.store.js"

const EMPTY = Object.freeze([])

// 이전 byUuid와 비교해 새로 생기거나 바뀐 칸만 (지워진 칸은 무시)
function newEntries(byUuid, prevByUuid) {
    return Object.entries(byUuid ?? {})
        .filter(([uuid, entry]) => entry && prevByUuid?.[uuid] !== entry)
        .map(([uuid, entry]) => ({
            id: `${uuid}-${entry.sentAt}`,
            at: Number.isFinite(entry.sentAt) ? entry.sentAt : Date.now(),
            playerId: uuid,
            itemId: entry.itemId,
        }))
}

export function useEmojiHistory() {
    const gameId = useInGameStore((s) => s.gameId)
    const emojis = useTalkHistoryStore((s) => (s.gameId === gameId ? s.emojis : EMPTY))

    useEffect(() => {
        return useInGameEmojiBubbleStore.subscribe((state, prevState) => {
            const added = newEntries(state.byUuid, prevState.byUuid)
            if (added.length === 0) return
            const history = useTalkHistoryStore.getState()
            history.ensureGame(gameId)
            history.addEmojis(added)
        })
    }, [gameId])

    return emojis
}
