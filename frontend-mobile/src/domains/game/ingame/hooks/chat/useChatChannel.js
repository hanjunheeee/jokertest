// 채팅 채널 상태 훅: 지금 보는 채널·보낼 수 있는지·막힌 까닭과 내 id
// ChatPanel·크게 보기 시트가 씀, 채널 고르기는 데스크톱 utils 그대로 (낮·밤 직업·죽은 사람)
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { selectOwnedGameChatContext } from "@/domains/game/ingame/utils/selectOwnedGameChatContext.js"
import { INGAME_CHAT_CHANNELS } from "@/domains/game/ingame/utils/inGameChatChannel.js"
import { isJokerNightChatEligible, selectInGameSelfAlive } from "@/domains/game/ingame/utils/selfAlive.js"

// 밤 직업 채널 이름 (밤 차례 안내와 같은 이름, 시민은 따로)
const NIGHT_ROLE_LABEL = Object.freeze({
    [INGAME_CHAT_CHANNELS.JOKER]: "광대",
    [INGAME_CHAT_CHANNELS.CITIZEN]: "시민",
    [INGAME_CHAT_CHANNELS.DOCTOR]: "의사",
    [INGAME_CHAT_CHANNELS.GUARD]: "경비원",
    [INGAME_CHAT_CHANNELS.WITCH_HUNTER]: "마녀사냥꾼",
})

// 채널 → 표시 모양 종류·이름 (tone은 배지 색 고르기용)
function describeChannel(channel) {
    if (channel === INGAME_CHAT_CHANNELS.DAY) return { tone: "day", label: "낮 채팅" }
    if (channel === INGAME_CHAT_CHANNELS.DEAD) return { tone: "dead", label: "죽은 자 채팅" }
    if (channel === INGAME_CHAT_CHANNELS.JOKER) return { tone: "joker", label: "광대 밤 채팅" }
    if (NIGHT_ROLE_LABEL[channel]) return { tone: "night", label: `${NIGHT_ROLE_LABEL[channel]} 밤 채팅` }
    return { tone: "off", label: "채팅 없음" }
}

// 못 보낼 때 까닭 글 (보낼 수 있으면 null)
function resolveBlockedReason({ viewChannel, canSend, alive, phase }) {
    if (canSend) return null
    if (!viewChannel) {
        if (alive === false && phase === "NIGHT") return "죽은 사람은 밤 채팅을 볼 수 없음"
        return "지금은 채팅을 쓸 수 없음"
    }
    if (alive === false) return "죽은 사람은 읽기만 가능"
    return "지금은 읽기만 가능"
}

// 밤 직업 채팅이면 조커 세션(데스크톱 useInGameChatShellProps와 같은 조건), 아니면 낮 세션 채널
export function useChatChannel() {
    const gameId = useInGameStore((s) => s.gameId)
    const gameState = useInGameStore((s) => s.state)
    const authUuid = useAuthStore((s) => s.user?.uuid ?? null)

    const owned = selectOwnedGameChatContext({ gameId, state: gameState }, authUuid)
    const nightEligible = isJokerNightChatEligible(gameState)
    const alive = selectInGameSelfAlive(gameState)
    const viewChannel = owned.viewChannel
    const canSend = nightEligible || Boolean(owned.sendChannel)

    return {
        viewChannel,
        canSend,
        readOnly: Boolean(viewChannel) && !canSend,
        blockedReason: resolveBlockedReason({ viewChannel, canSend, alive, phase: gameState?.phase }),
        selfId: gameState?.self?.uuid ?? authUuid,
        ...describeChannel(viewChannel),
    }
}
