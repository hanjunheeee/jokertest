// 받은 이모티콘 쌓기: 말풍선 스토어는 사람마다 마지막 1개만 3초 두므로, 새로 뜰 때마다 따로 기록
// 읽기는 useTalkFeed, 기록은 InGamePage(useRecordEmojiHistory)가 늘 함 → 폰을 가로로 돌려 채팅방이 없을 때 온 것도 남음
// 받은 순번을 id에 붙임 → 시각 없는 이모티콘이 같은 사람에게서 연달아 와도 따로 기록
import { useEffect } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "@/domains/game/ingame/store/inGameEmojiBubble.store.js"
import { useTalkHistoryStore } from "./talkHistory.store.js"

const EMPTY = Object.freeze([])

// 이전 byUuid와 비교해 새로 생기거나 바뀐 칸만 (지워진 칸은 무시)
let receivedSeq = 0

function newEntries(byUuid, prevByUuid) {
    return Object.entries(byUuid ?? {})
        .filter(([uuid, entry]) => entry && prevByUuid?.[uuid] !== entry)
        .map(([uuid, entry]) => ({
            id: `${uuid}-${entry.sentAt}-${(receivedSeq += 1)}`,
            at: Number.isFinite(entry.sentAt) ? entry.sentAt : Date.now(),
            playerId: uuid,
            itemId: entry.itemId,
        }))
}

export function useEmojiHistory() {
    const gameId = useInGameStore((s) => s.gameId)
    return useTalkHistoryStore((s) => (s.gameId === gameId ? s.emojis : EMPTY))
}

// 말풍선 스토어 구독: 인게임 화면 내내 붙어 있어야 해서 InGamePage가 부름
export function useRecordEmojiHistory() {
    const gameId = useInGameStore((s) => s.gameId)

    useEffect(() => {
        return useInGameEmojiBubbleStore.subscribe((state, prevState) => {
            const added = newEntries(state.byUuid, prevState.byUuid)
            if (added.length === 0) return
            const history = useTalkHistoryStore.getState()
            history.ensureGame(gameId)
            history.addEmojis(added)
        })
    }, [gameId])
}
