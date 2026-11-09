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
import { pickInGameJobPortrait } from "../../utils/pickInGameJobPortrait.js"
import { INGAME_PLAYER_STATUS } from "../../../shared/constants/ingamePlayerStatus.js"
import InGameTribunalPresentationOverlay from "./InGameTribunalPresentationOverlay.jsx"

// 보드 목록에 피고가 없을 때 쓰는 이름
const UNKNOWN_DEFENDANT_NICKNAME = "알 수 없는 플레이어"

// 판정 버튼은 개발 빌드에서만 (실제 판은 서버 마감 타이머가 판정)
const SHOW_DEV_RESOLVE = import.meta.env?.DEV === true

// 재판 중·피고 있음·판정 전일 때만 띄움 (채팅 틀·인게임 화면도 같은 조건)
function pickDevResolveLabel(ctx) {
  if (!SHOW_DEV_RESOLVE) return null
  if (ctx?.gameState?.tribunal?.resolved === true) return TRIBUNAL_RESOLVE_DONE_LABEL
  if (ctx?.tribunalResolveLocked) return TRIBUNAL_RESOLVE_RESOLVING_LABEL
  return TRIBUNAL_RESOLVE_LABEL
}

export default function InGameTribunalPresentationGate() {
  const ctx = useContext(InGameActionContext)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid ?? null)
  const tribunalResolved = useInGameStore((s) => s.state?.tribunal?.resolved === true)
  const { players } = useInGamePlayerSessionContext()
  const storeDefendantNickname = useInGameStore((s) => {
    const found = (s.state?.players ?? []).find((player) => player?.uuid === defendantUuid)
    return typeof found?.nickname === "string" && found.nickname.length > 0 ? found.nickname : null
  })

  const open = phase === "TRIBUNAL" && Boolean(defendantUuid) && !tribunalResolved

  // 피고는 보드 플레이어 목록에서 찾음 (카드 그림·이름 같이 쓰려고)
  // 못 찾아도 기본 그림으로 띄움: 채팅 틀은 재판 중이면 숨으므로, 안 띄우면 채팅이 둘 다 사라짐
  const defendant = useMemo(() => {
    if (!defendantUuid) return null
    const found = players.find((player) => player.id === defendantUuid)
    if (found) return found
    return {
      id: defendantUuid,
      nickname: storeDefendantNickname ?? UNKNOWN_DEFENDANT_NICKNAME,
      portraitSrc: pickInGameJobPortrait(0),
      status: INGAME_PLAYER_STATUS.ALIVE,
      theme: null,
    }
  }, [defendantUuid, players, storeDefendantNickname])

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

  // 판정 버튼 글자: 개발 빌드 아니면 없음, 끝남 → 판정 중 → 기본
  const devResolveLabel = pickDevResolveLabel(ctx)
  const devResolveEnabled = Boolean(ctx?.tribunalResolveControlsEnabled)

  const chatProps = useInGameChatSessionContext()

  // 재판 아니면 안 띄움
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
