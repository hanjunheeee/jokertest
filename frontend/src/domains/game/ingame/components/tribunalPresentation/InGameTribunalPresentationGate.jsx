// 재판 연출 문지기: 재판 중일 때 피고·투표 버튼·안내·채팅 값을 모아 연출 창 띄움
// 인게임 화면이 사용, 투표·판정은 조작 컨텍스트, 채팅은 채팅 세션 컨텍스트에서 꺼냄
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

// 재판 중·피고 있음·판정 전일 때만 띄움 (채팅 틀·인게임 화면도 같은 조건)
export default function InGameTribunalPresentationGate() {
  const ctx = useContext(InGameActionContext)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid ?? null)
  const tribunalResolved = useInGameStore((s) => s.state?.tribunal?.resolved === true)
  const { players } = useInGamePlayerSessionContext()

  const open = phase === "TRIBUNAL" && Boolean(defendantUuid) && !tribunalResolved

  // 피고는 보드 플레이어 목록에서 찾음 (카드 그림·이름 같이 쓰려고)
  const defendant = useMemo(
    () => (defendantUuid ? players.find((player) => player.id === defendantUuid) ?? null : null),
    [defendantUuid, players],
  )

  const tribunalVoteHasSubmitted = ctx?.tribunalVoteHasSubmitted === true

  // 피고 아님·살아 있음·아직 안 냄일 때만 유죄·무죄 버튼
  const showVoteButtons = Boolean(
    ctx
    && !ctx.tribunalVoteIsDefendant
    && ctx.tribunalVoteAlive !== false
    && !tribunalVoteHasSubmitted
    && ctx.tribunalVoteStatus !== "submitted",
  )

  // 버튼 못 보이면 그 이유 안내 문구 (피고·죽음·이미 냄)
  const noticeText = showVoteButtons
    ? null
    : resolveInGameTribunalPresentationNotice({
      isDefendant: ctx?.tribunalVoteIsDefendant === true,
      alive: ctx?.tribunalVoteAlive !== false,
      hasSubmitted: tribunalVoteHasSubmitted,
      status: ctx?.tribunalVoteStatus ?? "idle",
    })

  const voteButtonsEnabled = Boolean(ctx?.tribunalVoteControlsEnabled)

  // 판정 버튼 글자: 끝남 → 판정 중 → 기본
  const devResolveLabel = ctx?.gameState?.tribunal?.resolved === true
    ? TRIBUNAL_RESOLVE_DONE_LABEL
    : ctx?.tribunalResolveLocked
      ? TRIBUNAL_RESOLVE_RESOLVING_LABEL
      : TRIBUNAL_RESOLVE_LABEL
  const devResolveEnabled = Boolean(ctx?.tribunalResolveControlsEnabled)

  const chatProps = useInGameChatSessionContext()

  // 재판 아니거나 피고를 목록에서 못 찾으면 안 띄움
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
