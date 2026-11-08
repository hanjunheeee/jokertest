// 카톡형 채팅방 목록: 채팅 세션 말 + 시스템 알림 + 받은 이모티콘을 시각 순 한 줄 목록으로
// TalkList가 씀, 밤 조커 채팅 여부·죽은 사람끼리 여부는 데스크톱 채팅 세션이 고르는 조건 그대로
import { useMemo } from "react"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { isJokerNightChatEligible } from "@/domains/game/ingame/utils/selfAlive.js"
import { buildTalkFeed } from "@m/domains/game/ingame/utils/talk/buildTalkFeed.js"
import { useEmojiHistory } from "./useEmojiHistory.js"
import { useSystemNotices } from "./useSystemNotices.js"

// 받은 말·이모티콘 중 가장 늦은 시각 (없으면 null)
function latestServerAt(messages = [], emojis = []) {
    let latest = null
    for (const item of messages ?? []) if (Number.isFinite(item.sentAt) && (latest === null || item.sentAt > latest)) latest = item.sentAt
    for (const item of emojis) if (Number.isFinite(item.at) && (latest === null || item.at > latest)) latest = item.at
    return latest
}

export function useTalkFeed() {
    const session = useInGameChatSessionContext()
    const { localPlayerId, getPlayerById } = useInGamePlayerSessionContext()
    const joker = useInGameStore((s) => isJokerNightChatEligible(s.state))
    const emojis = useEmojiHistory()
    const latestAt = latestServerAt(session.messages, emojis)
    const notices = useSystemNotices(latestAt)

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

    // 죽은 뒤엔 죽은 사람끼리 채팅 (채팅 세션이 알려 줌)
    const dead = session.isDeadChat === true

    return { lines, joker, dead, session }
}
