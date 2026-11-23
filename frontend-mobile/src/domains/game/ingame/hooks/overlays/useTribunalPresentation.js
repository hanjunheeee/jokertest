// 재판(최후의 변론) 화면 값: 피고·유무죄·안내·판정 (데스크톱 TribunalGate와 같은 판단)
// TribunalGate(가로), TalkLayout 시트(세로 카톡형)가 씀
import { useContext, useMemo } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { InGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
    TRIBUNAL_RESOLVE_DONE_LABEL,
    TRIBUNAL_RESOLVE_LABEL,
    TRIBUNAL_RESOLVE_RESOLVING_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { resolveInGameTribunalPresentationNotice } from "@/domains/game/ingame/utils/resolveInGameTribunalPresentationNotice.js"
import { pickInGameJobPortrait } from "@/domains/game/ingame/utils/pickInGameJobPortrait.js"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"

const NO_PLAYERS = []
const UNKNOWN_DEFENDANT_NICKNAME = "알 수 없는 플레이어"

function resolveLabel(ctx) {
    if (ctx?.gameState?.tribunal?.resolved === true) return TRIBUNAL_RESOLVE_DONE_LABEL
    if (ctx?.tribunalResolveLocked) return TRIBUNAL_RESOLVE_RESOLVING_LABEL
    return TRIBUNAL_RESOLVE_LABEL
}

export function useTribunalPresentation() {
    const ctx = useContext(InGameActionContext)
    const players = useContext(InGamePlayerSessionContext)?.players ?? NO_PLAYERS
    const phase = useInGameStore((s) => s.state?.phase ?? null)
    const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid ?? null)
    const resolved = useInGameStore((s) => s.state?.tribunal?.resolved === true)
    const storeDefendantNickname = useInGameStore((s) => {
        const found = (s.state?.players ?? []).find((player) => player?.uuid === defendantUuid)
        return typeof found?.nickname === "string" && found.nickname.length > 0 ? found.nickname : null
    })

    const active = phase === "TRIBUNAL" && Boolean(defendantUuid) && !resolved

    const defendant = useMemo(() => {
        if (!defendantUuid) return null
        const found = players.find((p) => p.id === defendantUuid)
        if (found) return found
        return {
            id: defendantUuid,
            nickname: storeDefendantNickname ?? UNKNOWN_DEFENDANT_NICKNAME,
            portraitSrc: pickInGameJobPortrait(0),
            status: INGAME_PLAYER_STATUS.ALIVE,
            theme: null,
        }
    }, [defendantUuid, players, storeDefendantNickname])

    const hasSubmitted = ctx?.tribunalVoteHasSubmitted === true
    const showVoteButtons = Boolean(
        ctx && !ctx.tribunalVoteIsDefendant && ctx.tribunalVoteAlive !== false
        && !hasSubmitted && ctx.tribunalVoteStatus !== "submitted",
    )
    const noticeText = showVoteButtons
        ? null
        : resolveInGameTribunalPresentationNotice({
            isDefendant: ctx?.tribunalVoteIsDefendant === true,
            alive: ctx?.tribunalVoteAlive !== false,
            hasSubmitted,
            status: ctx?.tribunalVoteStatus ?? "idle",
        })

    return {
        active,
        defendant,
        showVoteButtons,
        noticeText,
        voteButtonsEnabled: Boolean(ctx?.tribunalVoteControlsEnabled),
        voteSubmitting: ctx?.tribunalVoteStatus === "submitting",
        onVoteGuilty: () => ctx?.submitTribunalVote?.("GUILTY"),
        onVoteNotGuilty: () => ctx?.submitTribunalVote?.("NOT_GUILTY"),
        devResolveLabel: ctx ? resolveLabel(ctx) : null,
        devResolveEnabled: Boolean(ctx?.tribunalResolveControlsEnabled),
        onDevResolve: () => ctx?.resolveTribunalVote?.(),
    }
}