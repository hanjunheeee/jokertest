// 행동 줄 훅: 행동 컨텍스트 값으로 구석 패널·단계 행동 버튼 목록·거절 까닭 글과 투표 현황 창 열림 상태 만들기 (재판 연출이 뜨면 창 닫음)
// 행동 줄(ActionRow)이 씀, 컨텍스트 Provider는 셸(InGamePage)이 데스크톱처럼 넣음
import { useCallback, useContext, useState } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectActionNotice } from "@/domains/game/ingame/utils/actionNotice.js"
import { selectTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"
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

  // 재판 연출이 뜨면 투표 현황 창도 닫음: 창이 body에 떠서 재판 창 위에 남아 유죄·무죄 단추를 가림
  // 재판이 끝나도 저절로 다시 안 뜸 (그리는 중에 바로 맞춤, 채팅 크게 보기와 같은 식)
  const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
  if (tribunalOpen && voteStatusOpen) setVoteStatusOpen(false)

  if (!ctx) return { ctx: null, cornerActions: [], phaseActions: [], noticeText: null, voteStatusOpen, closeVoteStatus }

  return {
    ctx,
    cornerActions: buildCornerActions(ctx, openVoteStatus),
    phaseActions: buildPhaseActions(ctx),
    // 낮 표·토론 준비·밤 고르기가 거절된 까닭 글 (다시 누르거나 단계가 바뀌면 지워짐, 데스크톱과 같은 계산)
    noticeText: selectActionNotice(ctx),
    nameOf: makeNameOf(ctx.gameState),
    voteStatusOpen,
    closeVoteStatus,
  }
}
