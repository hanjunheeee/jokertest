// 행동 줄 훅: 행동 컨텍스트 값으로 구석 패널·단계 행동 버튼 목록과 투표 현황 창 열림 상태 만들기
// 행동 줄(ActionRow)이 씀, 컨텍스트 Provider는 셸(InGamePage)이 데스크톱처럼 넣음
import { useCallback, useContext, useState } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { buildCornerActions, buildPhaseActions } from "./buildRowActions.js"

// 판 참가자 uuid → 별명 (명단에 없으면 uuid 그대로)
function makeNameOf(gameState) {
  const players = Array.isArray(gameState?.players) ? gameState.players : []
  return (uuid) => players.find((player) => player?.uuid === uuid)?.nickname || uuid
}

// Provider 밖이면 ctx null (행동 줄이 안 그림)
export function useActionRow() {
  const ctx = useContext(InGameActionContext)
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const openVoteStatus = useCallback(() => setVoteStatusOpen(true), [])
  const closeVoteStatus = useCallback(() => setVoteStatusOpen(false), [])

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
