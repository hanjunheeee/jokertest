// 사망 반영 계산: 지금 상태와 파싱한 사망 사건으로 바뀔 조각 만들기 (상태는 안 건드림)
// 단계 진행 액션(phaseActions의 applyPlayerEliminated)이 사용

// 밤 차례 비우기 조각 (constants/store/ingameStore.js에도 같은 값 있음)
const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

// 판 끝 사건이면 ENDED로 넘기고, 아니면 생존이 바뀐 사람만 덮음
export function applyPlayerEliminatedPure(current, parsed) {
  // 모양 이상·다른 판·끝난 판·명단 없음이면 그대로
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
  if (!current.gameId || !current.state) return current
  if (parsed.gameId !== current.gameId) return current
  if (current.state.phase === "ENDED") return current
  if (!Array.isArray(parsed.players)) return current
  if (!Array.isArray(current.state.players)) return current

  const aliveByUuid = new Map(parsed.players.map((p) => [p.uuid, p.alive]))

  // 사건에 있고 생존 값이 다른 사람만 새로 만듦
  let changed = false
  const nextPlayers = current.state.players.map((player) => {
    if (!aliveByUuid.has(player.uuid)) return player
    const alive = aliveByUuid.get(player.uuid)
    if (player.alive === alive) return player
    changed = true
    return { ...player, alive }
  })

  // 판 끝: 낮 단계·밤 차례 비우고 승패 결과가 오면 붙임
  if (parsed.terminal) {
    return {
      state: {
        ...current.state,
        phase: "ENDED",
        dayPhase: null,
        ...CLEARED_NIGHT_TURN,
        players: nextPlayers,
        ...(parsed.winResult ? { winResult: parsed.winResult } : {}),
      },
    }
  }

  // 바뀐 사람 없으면 같은 상태 그대로 (다시 그리기 막기)
  if (!changed) return current

  return { state: { ...current.state, players: nextPlayers } }
}
