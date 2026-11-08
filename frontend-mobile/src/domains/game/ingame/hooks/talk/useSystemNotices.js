// 시스템 알림 쌓기: 참가자 상태가 살아 있음 → 죽음·끊김으로 바뀌면 알림 줄 하나씩 더함
// useTalkFeed가 씀, 처형·사망 소식이 채팅 목록에 안 들어와서 명단 변화를 보고 직접 만듦
// 기록은 talkHistory 저장소에 둬서 채팅방이 다시 그려져도 남음 (그사이 바뀐 명단도 다시 그릴 때 따라잡음)
import { useEffect } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { diffPlayerNotices } from "@m/domains/game/ingame/utils/talk/playerNotices.js"
import { useTalkHistoryStore } from "./talkHistory.store.js"

const EMPTY = Object.freeze([])

export function useSystemNotices(players) {
    const gameId = useInGameStore((s) => s.gameId)
    const notices = useTalkHistoryStore((s) => (s.gameId === gameId ? s.notices : EMPTY))

    useEffect(() => {
        const history = useTalkHistoryStore.getState()
        history.ensureGame(gameId)
        const previous = history.swapPlayers(players)
        history.addNotices(diffPlayerNotices(previous, players, Date.now()))
    }, [gameId, players])

    return notices
}
