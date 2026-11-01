// 행동 줄 훅: 행동 컨텍스트 값으로 버튼 목록·안내 한 줄·투표 현황 시트 열림 상태 만들기
// 행동 줄(ActionRow)이 씀, 컨텍스트 Provider는 셸(InGamePage)이 데스크톱처럼 넣음
import { useCallback, useContext, useState } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { buildRowActions } from "./buildRowActions.js"
import { buildActionMessage } from "./buildActionMessage.js"

// 판 참가자 uuid → 별명 (모르면 알 수 없는 참가자)
function makeNameOf(gameState) {
  const players = Array.isArray(gameState?.players) ? gameState.players : []
  return (uuid) => players.find((player) => player?.uuid === uuid)?.nickname || "알 수 없는 참가자"
}

// Provider 밖이면 ctx null (행동 줄이 안 그림)
export function useActionRow() {
  const ctx = useContext(InGameActionContext)
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const openVoteStatus = useCallback(() => setVoteStatusOpen(true), [])
  const closeVoteStatus = useCallback(() => setVoteStatusOpen(false), [])

  if (!ctx) return { ctx: null, actions: [], message: null, voteStatusOpen, closeVoteStatus }

  const nameOf = makeNameOf(ctx.gameState)
  return {
    ctx,
    actions: buildRowActions(ctx, openVoteStatus),
    message: buildActionMessage(ctx, nameOf),
    nameOf,
    voteStatusOpen,
    closeVoteStatus,
  }
}
