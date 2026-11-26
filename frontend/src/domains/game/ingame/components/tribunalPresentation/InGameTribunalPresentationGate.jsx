// 재판 연출 문지기: 재판 중일 때 피고·투표 버튼·안내·채팅 값을 모아 연출 창 띄움, 표 거절 까닭 글도 띄움
// 인게임 화면이 사용, 투표는 조작 컨텍스트, 채팅은 채팅 세션 컨텍스트에서 꺼냄 (판정은 표가 다 차면 서버가 5초 뒤 함)
import { useContext, useMemo } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import { useInGameChatSessionContext } from "../chat/InGameChatSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { NOTICE_CLASS } from "../../constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import { INGAME_CHAT_USE_UNIFIED_PANEL } from "../../constants/chat/ingameChatAssets.js"
import { useTurnProgress } from "../../hooks/timebar/useTurnProgress.js"
import { resolveInGameTribunalPresentationNotice } from "../../utils/resolveInGameTribunalPresentationNotice.js"
import { pickInGameJobPortrait } from "../../utils/pickInGameJobPortrait.js"
import { selectInGameTimebarStatusLabel } from "../../utils/selectInGameTimebarStatusMessage.js"
import { selectInGameTimebarPhaseDeadline } from "../../utils/timebar/phaseDeadline.js"
import { INGAME_PLAYER_STATUS } from "../../../shared/constants/ingamePlayerStatus.js"
import InGameTribunalPresentationOverlay from "./InGameTribunalPresentationOverlay.jsx"

// 보드 목록에 피고가 없을 때 쓰는 이름
const UNKNOWN_DEFENDANT_NICKNAME = "알 수 없는 플레이어"

// 거절 까닭 글 자리: 연출 창(z-55·56) 위 가운데 위쪽, 단추는 그대로 눌리게 클릭은 통과
const VOTE_ERROR_WRAP_CLASS = "pointer-events-none absolute inset-x-0 top-[8%] z-[57] flex justify-center px-4"
const VOTE_ERROR_TEXT_CLASS = `${NOTICE_CLASS} max-w-[min(32rem,90%)] rounded-md bg-black/70 px-4 py-2`

// 보드 명단 또는 스토어 명단에서 피고 표시 정보 찾기 (없으면 기본 초상화)
function useTribunalDefendant(defendantUuid) {
  const { players } = useInGamePlayerSessionContext()
  const storeDefendantNickname = useInGameStore((s) => {
    const found = (s.state?.players ?? []).find((player) => player?.uuid === defendantUuid)
    return typeof found?.nickname === "string" && found.nickname.length > 0 ? found.nickname : null
  })

  return useMemo(() => {
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
}

// 재판 중·피고 있음·판정 전일 때만 띄움 (채팅 틀·인게임 화면도 같은 조건)
export default function InGameTribunalPresentationGate() {
  const ctx = useContext(InGameActionContext)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid ?? null)
  const tribunalResolved = useInGameStore((s) => s.state?.tribunal?.resolved === true)
  const defendant = useTribunalDefendant(defendantUuid)
  const open = phase === "TRIBUNAL" && Boolean(defendantUuid) && !tribunalResolved

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

  // 서버가 표를 거절했거나 응답이 없으면 그 까닭 글 (다시 누르면 지워짐)
  // 연출 창은 단추가 보일 때 안내 글을 안 그려서 창 밖에 따로 띄움
  const voteErrorText = ctx?.tribunalVoteStatus !== "submitting"
    && typeof ctx?.tribunalVoteError === "string"
    && ctx.tribunalVoteError.trim().length > 0
    ? ctx.tribunalVoteError
    : null

  const chatProps = useInGameChatSessionContext()
  const gameState = useInGameStore((s) => s.state ?? null)
  const phaseTurnDeadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const timebarStatusLabel = selectInGameTimebarStatusLabel(gameState)
  const { remainingRatio, remainingSec } = useTurnProgress(open ? phaseTurnDeadline : null)
  const showEmbeddedPhaseTimer =
    INGAME_CHAT_USE_UNIFIED_PANEL
    && typeof timebarStatusLabel === "string"
    && timebarStatusLabel.length > 0

  // 재판 아니면 안 띄움
  if (!open || !defendant) return null

  return (
    <>
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
        showEmbeddedPhaseTimer={showEmbeddedPhaseTimer}
        embeddedPhaseTimerStatusLabel={timebarStatusLabel}
        embeddedPhaseTimerRemainingRatio={remainingRatio}
        embeddedPhaseTimerRemainingSec={remainingSec}
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
