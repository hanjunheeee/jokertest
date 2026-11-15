// 재판 연출 문지기: 재판 중·피고 있음·판정 전일 때 피고·투표·안내·채팅 값 모아 연출 창 띄움, 표 거절 까닭 글도 띄움
// OverlayLayer가 씀, 투표·판정은 행동 컨텍스트, 채팅은 채팅 세션 컨텍스트 (데스크톱 Gate와 같은 판단)
import { useContext, useMemo } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { InGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { InGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
    TRIBUNAL_RESOLVE_DONE_LABEL,
    TRIBUNAL_RESOLVE_LABEL,
    TRIBUNAL_RESOLVE_RESOLVING_LABEL,
} from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { NOTICE_CLASS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import { resolveInGameTribunalPresentationNotice } from "@/domains/game/ingame/utils/resolveInGameTribunalPresentationNotice.js"
import TribunalOverlay from "./TribunalOverlay.jsx"

const NO_PLAYERS = []

// 거절 까닭 글 자리: 연출 창(z-55) 위 맨 위 가운데(노치 피함), 단추는 그대로 눌리게 클릭은 통과
const VOTE_ERROR_WRAP_CLASS = "pointer-events-none fixed inset-x-0 top-0 z-[56] flex justify-center px-4 safe-pt"
const VOTE_ERROR_TEXT_CLASS = `${NOTICE_CLASS} mt-3 max-w-full rounded-md bg-black/70 px-4 py-2`

// 판정 버튼 글자: 끝남 → 판정 중 → 기본
function resolveLabel(ctx) {
    if (ctx?.gameState?.tribunal?.resolved === true) return TRIBUNAL_RESOLVE_DONE_LABEL
    if (ctx?.tribunalResolveLocked) return TRIBUNAL_RESOLVE_RESOLVING_LABEL
    return TRIBUNAL_RESOLVE_LABEL
}

// 컨텍스트가 없으면(Provider 밖) 버튼·채팅 없이 카드만
export default function TribunalGate() {
    const ctx = useContext(InGameActionContext)
    const chatProps = useContext(InGameChatSessionContext)
    const players = useContext(InGamePlayerSessionContext)?.players ?? NO_PLAYERS
    const phase = useInGameStore((s) => s.state?.phase ?? null)
    const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid ?? null)
    const resolved = useInGameStore((s) => s.state?.tribunal?.resolved === true)

    const open = phase === "TRIBUNAL" && Boolean(defendantUuid) && !resolved

    // 피고는 판 플레이어 목록에서 찾음 (카드 그림·이름 같이 쓰려고)
    const defendant = useMemo(
        () => (defendantUuid ? players.find((p) => p.id === defendantUuid) ?? null : null),
        [defendantUuid, players],
    )

    if (!open || !defendant) return null

    const hasSubmitted = ctx?.tribunalVoteHasSubmitted === true
    // 피고 아님·살아 있음·아직 안 냄일 때만 유죄·무죄 버튼
    const showVoteButtons = Boolean(
        ctx && !ctx.tribunalVoteIsDefendant && ctx.tribunalVoteAlive !== false
        && !hasSubmitted && ctx.tribunalVoteStatus !== "submitted",
    )
    const noticeText = showVoteButtons ? null : resolveInGameTribunalPresentationNotice({
        isDefendant: ctx?.tribunalVoteIsDefendant === true,
        alive: ctx?.tribunalVoteAlive !== false,
        hasSubmitted,
        status: ctx?.tribunalVoteStatus ?? "idle",
    })
    // 서버가 표를 거절했거나 응답이 없으면 그 까닭 글 (다시 누르면 지워짐)
    // 연출 창은 단추가 보일 때 안내 글을 안 그려서 창 밖에 따로 띄움
    const voteErrorText = ctx?.tribunalVoteStatus !== "submitting"
        && typeof ctx?.tribunalVoteError === "string"
        && ctx.tribunalVoteError.trim().length > 0
        ? ctx.tribunalVoteError
        : null

    return (
        <>
            <TribunalOverlay
                defendant={defendant}
                showVoteButtons={showVoteButtons}
                noticeText={noticeText}
                voteButtonsEnabled={Boolean(ctx?.tribunalVoteControlsEnabled)}
                voteSubmitting={ctx?.tribunalVoteStatus === "submitting"}
                onVoteGuilty={() => ctx?.submitTribunalVote?.("GUILTY")}
                onVoteNotGuilty={() => ctx?.submitTribunalVote?.("NOT_GUILTY")}
                chatProps={chatProps}
                devResolveLabel={ctx ? resolveLabel(ctx) : null}
                devResolveEnabled={Boolean(ctx?.tribunalResolveControlsEnabled)}
                onDevResolve={() => ctx?.resolveTribunalVote?.()}
            />
            {voteErrorText ? (
                <div className={VOTE_ERROR_WRAP_CLASS}>
                    <p role="alert" className={VOTE_ERROR_TEXT_CLASS} data-ingame-tribunal-vote-error="">
                        {voteErrorText}
                    </p>
                </div>
            ) : null}
        </>
    )
}
