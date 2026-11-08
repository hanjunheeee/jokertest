// 시스템 알림 쌓기: 참가자 상태가 살아 있음 → 죽음·끊김으로 바뀌면 알림 줄 하나씩 더함
// useTalkFeed가 씀, 처형·사망 소식이 채팅 목록에 안 들어와서 명단 변화를 보고 직접 만듦
// 기록은 talkHistory 저장소에 둬서 채팅방이 다시 그려져도 남음 (그사이 바뀐 명단도 다시 그릴 때 따라잡음)
import { useEffect, useMemo, useRef } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { diffPlayerNotices, toNoticePlayers } from "@m/domains/game/ingame/utils/talk/playerNotices.js"
import { useTalkHistoryStore } from "./talkHistory.store.js"

const EMPTY = Object.freeze([])

// 화면용 명단은 끊김을 먼저 보여 줘 사망이 가려짐 → 판 참가자(살았는지·연결됐는지 따로)로 셈
// latestAt: 지금까지 받은 말·이모티콘 중 가장 늦은 서버 시각 → 알림을 그 뒤에 끼움 (폰 시계가 어긋나도 자리 안 틀어지게)
export function useSystemNotices(latestAt = null) {
    const latestAtRef = useRef(latestAt)
    useEffect(() => {
        latestAtRef.current = latestAt
    }, [latestAt])
    const gameId = useInGameStore((s) => s.gameId)
    const rawPlayers = useInGameStore((s) => s.state?.players ?? null)
    const players = useMemo(() => toNoticePlayers(rawPlayers), [rawPlayers])
    const notices = useTalkHistoryStore((s) => (s.gameId === gameId ? s.notices : EMPTY))

    useEffect(() => {
        const history = useTalkHistoryStore.getState()
        history.ensureGame(gameId)
        if (!players) return
        const previous = history.swapPlayers(players)
        const at = Number.isFinite(latestAtRef.current) ? latestAtRef.current : Date.now()
        history.addNotices(diffPlayerNotices(previous, players, at))
    }, [gameId, players])

    return notices
}
