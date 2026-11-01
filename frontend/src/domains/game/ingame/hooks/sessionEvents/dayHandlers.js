// 판 진행 이벤트 손잡이 (낮·재판·사망·참여): 받은 사건을 파싱해 스토어에 넣고 효과음
// 판 진행 이벤트 훅이 구독 붙일 때마다 새로 만듦
import { useInGameStore } from "../../store/ingameStore.js"
import { parseDayVoteResolvedPayload } from "../../utils/dayVoteResolve.js"
import { parseDayPhaseChangedPayload } from "../../utils/parseDayPhaseChangedPayload.js"
import { parsePlayerEliminatedPayload } from "../../utils/parsePlayerEliminatedPayload.js"
import { currentAccountId } from "./scope.js"
import { currentReceiptScope, isRegistrationScopeCurrent } from "./scope.js"
import { originOf, playGameSfx, playResultSfxIfEnded } from "./sfx.js"

// registered: 구독을 붙인 때의 수신 범위 (그 뒤 범위가 바뀌면 사건을 버림)
export function createDayHandlers(registered) {
  const isCurrent = () => isRegistrationScopeCurrent(registered)

  // 역할 공개 → 첫 단계 (바뀌었을 때만 효과음)
  const phaseChanged = (payload) => {
    if (!isCurrent()) return
    const before = useInGameStore.getState().state
    useInGameStore.getState().applyPhaseChanged(payload)
    const after = useInGameStore.getState()
    if (after.state === before) return
    playGameSfx(
      "game-phase-changed",
      `game:${after.gameId}:phase:${after.state.phase}:${after.state.dayIndex}`,
      after.gameId,
      originOf(payload),
    )
  }

  // 낮 투표 판정 반영
  const dayVoteResolved = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const parsed = parseDayVoteResolvedPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
    })
    if (!parsed) return
    useInGameStore
      .getState()
      .applyDayVoteResolvedToPhase(current.gameId, parsed.dayIndex, {
        ...parsed,
        outcome: parsed.outcome,
        defendantUuid: parsed.tribunalTargetUuid,
      })

    const round = Number.isInteger(parsed.round) ? parsed.round : 1
    playGameSfx(
      "day-vote-resolved",
      `game:${current.gameId}:day:${parsed.dayIndex}:round:${round}:day-resolved`,
      current.gameId,
      originOf(payload),
    )
  }

  // 낮 토론 → 투표
  const dayPhaseChanged = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const parsed = parseDayPhaseChangedPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
    })
    if (!parsed) return
    useInGameStore.getState().applyDayPhaseChanged(parsed)
    playGameSfx(
      "day-phase-changed",
      `game:${current.gameId}:day:${parsed.dayIndex}:dayphase:${parsed.dayPhase}`,
      current.gameId,
      originOf(payload),
    )
  }

  // 재판 판정 반영 (바뀌었을 때만 효과음, 판이 끝났으면 결과 효과음까지)
  const tribunalVoteResolved = (payload) => {
    if (!isCurrent()) return
    const before = useInGameStore.getState().state
    useInGameStore.getState().applyTribunalResolved(payload, currentReceiptScope())
    const after = useInGameStore.getState()
    if (after.state === before || !after.gameId || !after.state) return
    playGameSfx(
      "tribunal-vote-resolved",
      `game:${after.gameId}:day:${after.state.dayIndex}:tribunal-resolved`,
      after.gameId,
      originOf(payload),
    )
    playResultSfxIfEnded(originOf(payload))
  }

  // 사망 반영 (지금 명단·이미 죽은 사람 기준으로 파싱)
  // 효과음 id는 서버가 주면 그대로, 아니면 날짜·대상으로 만듦
  const playerEliminated = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const players = current.state.players ?? []
    const canonicalPlayerIds = new Set(players.map((p) => p.uuid))
    const previouslyDeadUuids = new Set(players.filter((p) => p.alive === false).map((p) => p.uuid))
    const parsed = parsePlayerEliminatedPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
      phase: current.state.phase,
      canonicalPlayerIds,
      previouslyDeadUuids,
    })
    if (!parsed) return

    const before = current.state
    useInGameStore.getState().applyPlayerEliminated(parsed, currentReceiptScope())
    if (useInGameStore.getState().state === before) return

    const envelope = payload?.sfxEvent
    const eventId =
      envelope !== null && typeof envelope === "object" && typeof envelope.eventId === "string"
        ? envelope.eventId
        : `game:${current.gameId}:day:${parsed.dayIndex}:victim:${parsed.victimUuid}:eliminated`
    playGameSfx("player-eliminated", eventId, current.gameId, envelope ? (envelope.origin ?? "restore") : "live")
    playResultSfxIfEnded(originOf(payload))
  }

  // 참여 여부 바뀜
  const participationChanged = (payload) => {
    if (!isCurrent()) return
    useInGameStore.getState().applyParticipationChanged(payload)
  }

  // 본인 제출 상태 (로그인돼 있을 때만, 범위 검사는 스토어 순번으로 함)
  const selfProgress = (payload) => {
    if (currentAccountId() === null) return
    useInGameStore.getState().applySelfProgress(payload)
  }

  return {
    phaseChanged,
    dayVoteResolved,
    dayPhaseChanged,
    tribunalVoteResolved,
    playerEliminated,
    participationChanged,
    selfProgress,
  }
}
