// 카톡형 채팅방 목록: 채팅 세션 말 + 시스템 알림 + 받은 이모티콘을 시각 순 한 줄 목록으로
// TalkList가 씀, 밤 조커 채팅 여부는 데스크톱 채팅 세션이 고르는 조건 그대로
import { useMemo } from "react"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { isJokerNightChatEligible } from "@/domains/game/ingame/utils/selfAlive.js"
import { buildTalkFeed } from "@m/domains/game/ingame/utils/talk/buildTalkFeed.js"
import { useEmojiHistory } from "./useEmojiHistory.js"
import { useSystemNotices } from "./useSystemNotices.js"

export function useTalkFeed() {
    const session = useInGameChatSessionContext()
    const { players, localPlayerId, getPlayerById } = useInGamePlayerSessionContext()
    const joker = useInGameStore((s) => isJokerNightChatEligible(s.state))
    const notices = useSystemNotices(players)
    const emojis = useEmojiHistory()

    const lines = useMemo(
        () => buildTalkFeed({
            messages: session.messages ?? [],
            notices,
            emojis,
            localPlayerId: localPlayerId ?? null,
            joker,
            nameOf: (id) => getPlayerById(id)?.nickname ?? "",
        }),
        [session.messages, notices, emojis, localPlayerId, joker, getPlayerById],
    )

    return { lines, joker, session }
}
