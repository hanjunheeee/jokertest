// 재판(최후의 변론) 화면 값: 피고·유무죄·안내·표 거절 까닭 (데스크톱 TribunalGate와 같은 판단, 판정은 서버가 5초 뒤 함)
// TribunalGate(가로), TalkLayout 시트(세로 카톡형)가 씀
import { useContext, useMemo } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { InGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { resolveInGameTribunalPresentationNotice } from "@/domains/game/ingame/utils/resolveInGameTribunalPresentationNotice.js"
import { pickInGameJobPortrait } from "@/domains/game/ingame/utils/pickInGameJobPortrait.js"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"

const NO_PLAYERS = []
const UNKNOWN_DEFENDANT_NICKNAME = "알 수 없는 플레이어"

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
    // 서버가 표를 거절했거나 응답이 없으면 그 까닭 글 (다시 누르면 지워짐)
    // 연출 창·시트는 단추가 보일 때 안내 글을 안 그려서 따로 띄움
    const voteErrorText = ctx?.tribunalVoteStatus !== "submitting"
        && typeof ctx?.tribunalVoteError === "string"
        && ctx.tribunalVoteError.trim().length > 0
        ? ctx.tribunalVoteError
        : null

    return {
        active,
        defendant,
        showVoteButtons,
        noticeText,
        voteButtonsEnabled: Boolean(ctx?.tribunalVoteControlsEnabled),
        voteSubmitting: ctx?.tribunalVoteStatus === "submitting",
        onVoteGuilty: () => ctx?.submitTribunalVote?.("GUILTY"),
        onVoteNotGuilty: () => ctx?.submitTribunalVote?.("NOT_GUILTY"),
        voteErrorText,
    }
}