const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

export function applyPlayerEliminatedPure(current, parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
  if (!current.gameId || !current.state) return current
  if (parsed.gameId !== current.gameId) return current
  if (current.state.phase === "ENDED") return current
  if (!Array.isArray(parsed.players)) return current
  if (!Array.isArray(current.state.players)) return current

  const aliveByUuid = new Map(parsed.players.map((p) => [p.uuid, p.alive]))

  let changed = false
  const nextPlayers = current.state.players.map((player) => {
    if (!aliveByUuid.has(player.uuid)) return player
    const alive = aliveByUuid.get(player.uuid)
    if (player.alive === alive) return player
    changed = true
    return { ...player, alive }
  })

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

  if (!changed) return current

  return { state: { ...current.state, players: nextPlayers } }
}
