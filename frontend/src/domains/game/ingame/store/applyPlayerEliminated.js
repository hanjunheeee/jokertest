/**
 * player_eliminated 반영 reducer(F-16 AC-01).
 *
 * 호출부(useGameSessionSocketEvents)가 parsePlayerEliminatedPayload로 검증한 값만 넘기지만,
 * 이 store의 다른 reducer들과 같은 이유로 gameId/종료 불변성은 여기서도 독립적으로 다시
 * 확인한다. 넘어온 payload가 조건에 맞지 않으면 current를 **그대로** 돌려준다 — zustand가
 * 참조 변경 없이 완전한 no-op으로 처리해 리스너조차 호출하지 않는다.
 *
 * 보존 계약:
 *   - players[]의 기존 필드(nickname·themeIndex 등 외형)는 spread로 전부 보존하고 alive만
 *     바꾼다. 공개 payload에는 role/team이 없으므로 그 값을 덮어쓰지 않는다(AC-05).
 *   - nightPrivateResult는 건드리지 않는다 — 이 사건은 "비워지는 시점 셋"에 들어가지 않는다.
 *   - roster에 없는 uuid는 추가하지 않는다.
 */

/** 밤 역할 턴은 phase === "NIGHT"일 때만 의미가 있다(ingameStore의 CLEARED_NIGHT_TURN과 같은 계약). */
const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

export function applyPlayerEliminatedPure(current, parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
  if (!current.gameId || !current.state) return current
  if (parsed.gameId !== current.gameId) return current
  // 이미 ENDED면 어떤 stale broadcast도 종료 상태를 되돌리지 않는다(멱등·불변).
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
    // 외형 필드는 전부 보존하고 생존만 바꾼다.
    return { ...player, alive }
  })

  if (parsed.terminal) {
    // 끊김 사망으로 승패가 확정된 경로다. 생존 변화가 없더라도 종료 전이는 반영해야 한다.
    return {
      state: {
        ...current.state,
        phase: "ENDED",
        dayPhase: null, // 낮을 벗어났다.
        ...CLEARED_NIGHT_TURN,
        players: nextPlayers,
        ...(parsed.winResult ? { winResult: parsed.winResult } : {}),
      },
    }
  }

  // 일반 사망은 phase/dayIndex를 바꾸지 않는다 — 중복 방송이면 바뀐 것이 없으므로 no-op이다.
  if (!changed) return current

  return { state: { ...current.state, players: nextPlayers } }
}
