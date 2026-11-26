// 행동 줄 훅: 행동 컨텍스트 값으로 구석 패널·단계 행동 버튼 목록과 투표 현황 창 열림 상태 만들기 (전면 연출 시 창 닫음)
// 행동 줄(ActionRow)이 씀, 컨텍스트 Provider는 셸(InGamePage)이 데스크톱처럼 넣음
import { useCallback, useContext, useState } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectVoteStatusCoverOpen, useOverlayBridge } from "@m/domains/game/ingame/hooks/overlays/overlayBridge.js"
import { selectTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"
import { buildCornerActions, buildPhaseActions } from "./buildRowActions.js"

const UNKNOWN_TARGET_LABEL = "알 수 없는 플레이어"

// 판 참가자 uuid → 별명 (명단에 없으면 생 uuid 대신 안내 이름)
function makeNameOf(gameState) {
  const players = Array.isArray(gameState?.players) ? gameState.players : []
  return (uuid) => {
    const found = players.find((player) => player?.uuid === uuid)
    return typeof found?.nickname === "string" && found.nickname.length > 0 ? found.nickname : UNKNOWN_TARGET_LABEL
  }
}

// Provider 밖이면 ctx null (행동 줄이 안 그림)
export function useActionRow() {
  const ctx = useContext(InGameActionContext)
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const openVoteStatus = useCallback(() => setVoteStatusOpen(true), [])
  const closeVoteStatus = useCallback(() => setVoteStatusOpen(false), [])

  // 재판·낮 시작 결과·밤 차례 등 전면 연출이 뜨면 투표 현황 창을 닫음 (밤 단계 안내는 결과 확인을 위해 그대로 둠)
  const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
  const voteStatusCoverOpen = useOverlayBridge(selectVoteStatusCoverOpen)
  if ((tribunalOpen || voteStatusCoverOpen) && voteStatusOpen) setVoteStatusOpen(false)

  if (!ctx) return { ctx: null, cornerActions: [], phaseActions: [], voteStatusOpen, closeVoteStatus }

  return {
    ctx,
    cornerActions: buildCornerActions(ctx, openVoteStatus),
    phaseActions: buildPhaseActions(ctx),
    nameOf: makeNameOf(ctx.gameState),
    voteStatusOpen,
    closeVoteStatus,
  }
}
