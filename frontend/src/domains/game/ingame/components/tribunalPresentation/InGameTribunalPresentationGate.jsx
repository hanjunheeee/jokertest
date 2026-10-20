import { useContext, useMemo } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import { useInGameChatSessionContext } from "../chat/InGameChatSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import {
  TRIBUNAL_RESOLVE_DONE_LABEL,
  TRIBUNAL_RESOLVE_LABEL,
  TRIBUNAL_RESOLVE_RESOLVING_LABEL,
} from "../../constants/actions/ingameActionPanel.js"
import { resolveInGameTribunalPresentationNotice } from "../../utils/resolveInGameTribunalPresentationNotice.js"
import InGameTribunalPresentationOverlay from "./InGameTribunalPresentationOverlay.jsx"

/**
 * TRIBUNAL 미확정 구간에서 최후의 반론 연출을 띄운다.
 * InGameActionProvider·InGamePlayerSessionProvider 안에서만 사용한다.
 */
export default function InGameTribunalPresentationGate() {
  const ctx = useContext(InGameActionContext)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid ?? null)
  const tribunalResolved = useInGameStore((s) => s.state?.tribunal?.resolved === true)
  const { players } = useInGamePlayerSessionContext()

  const open = phase === "TRIBUNAL" && Boolean(defendantUuid) && !tribunalResolved

  const defendant = useMemo(
    () => (defendantUuid ? players.find((player) => player.id === defendantUuid) ?? null : null),
    [defendantUuid, players],
  )

  const tribunalVoteHasSubmitted = ctx?.tribunalVoteHasSubmitted === true

  const showVoteButtons = Boolean(
    ctx
    && !ctx.tribunalVoteIsDefendant
    && ctx.tribunalVoteAlive !== false
    && !tribunalVoteHasSubmitted
    && ctx.tribunalVoteStatus !== "submitted",
  )

  const noticeText = showVoteButtons
    ? null
    : resolveInGameTribunalPresentationNotice({
      isDefendant: ctx?.tribunalVoteIsDefendant === true,
      alive: ctx?.tribunalVoteAlive !== false,
      hasSubmitted: tribunalVoteHasSubmitted,
      status: ctx?.tribunalVoteStatus ?? "idle",
    })

  const voteButtonsEnabled = Boolean(ctx?.tribunalVoteControlsEnabled)

  // DEV 임시 — InGamePhaseActionRow와 동일 라벨·활성 조건(개발 끝나면 삭제)
  const devResolveLabel = ctx?.gameState?.tribunal?.resolved === true
    ? TRIBUNAL_RESOLVE_DONE_LABEL
    : ctx?.tribunalResolveLocked
      ? TRIBUNAL_RESOLVE_RESOLVING_LABEL
      : TRIBUNAL_RESOLVE_LABEL
  const devResolveEnabled = Boolean(ctx?.tribunalResolveControlsEnabled)

  const chatProps = useInGameChatSessionContext()

  if (!open || !defendant) return null

  return (
    <InGameTribunalPresentationOverlay
      open
      defendant={defendant}
      showVoteButtons={showVoteButtons}
      noticeText={noticeText}
      voteButtonsEnabled={voteButtonsEnabled}
      voteSubmitting={ctx?.tribunalVoteStatus === "submitting"}
      onVoteGuilty={() => ctx?.submitTribunalVote?.("GUILTY")}
      onVoteNotGuilty={() => ctx?.submitTribunalVote?.("NOT_GUILTY")}
      chatProps={chatProps}
      devResolveLabel={devResolveLabel}
      devResolveEnabled={devResolveEnabled}
      onDevResolve={() => ctx?.resolveTribunalVote?.()}
    />
  )
}
