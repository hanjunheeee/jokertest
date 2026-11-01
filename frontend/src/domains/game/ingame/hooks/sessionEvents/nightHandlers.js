// 판 진행 이벤트 손잡이 (밤): 밤 결과 적용·개인 결과·차례·성공 연출·연출 대기
// 판 진행 이벤트 훅(useGameSessionSocketEvents)이 구독 붙일 때마다 새로 만듦
import { useInGameStore } from "../../store/ingameStore.js"
import { parseNightResultAppliedPayload } from "../../utils/parseNightResultAppliedPayload.js"
import { parseInGameNightPrivateResultPayload } from "../../utils/reduceInGameNightPrivateResult.js"
import { selectInGameSelfAlive } from "../../utils/selfAlive.js"
import { parseNightTurnStartedPayload, parseNightTurnEndedPayload } from "../../utils/nightTurn.js"
import { currentAccountId, currentReceiptScope, isRegistrationScopeCurrent } from "./scope.js"
import { originOf, playGameSfx, playResultSfxIfEnded } from "./sfx.js"

// registered: 구독을 붙인 때의 수신 범위 (그 뒤 범위가 바뀌면 사건을 버림)
export function createNightHandlers(registered) {
  const isCurrent = () => isRegistrationScopeCurrent(registered)

  // 밤 결과 적용 (지금 명단·이미 죽은 사람 기준으로 파싱, 판이 끝났으면 결과 효과음)
  const nightResultApplied = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const canonicalPlayerIds = new Set((current.state.players ?? []).map((p) => p.uuid))
    const previouslyDeadUuids = new Set((current.state.players ?? []).filter((p) => p.alive === false).map((p) => p.uuid))
    const parsed = parseNightResultAppliedPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
      canonicalPlayerIds,
      previouslyDeadUuids,
    })
    if (!parsed) return
    useInGameStore.getState().applyNightResultAppliedPayload(parsed, currentReceiptScope())
    playResultSfxIfEnded(originOf(payload))
  }

  // 밤 개인 결과 넣기
  // 효과음은 서버 봉투가 본인 계정·지금 판 것일 때만 (암살은 실패음)
  const nightActionResult = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const parsed = parseInGameNightPrivateResultPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
      phase: current.state.phase,
      selfRole: current.state.self?.role ?? null,
      selfUuid: current.state.self?.uuid ?? null,
      selfAlive: selectInGameSelfAlive(current.state),
    })
    if (!parsed) return
    useInGameStore.getState().setNightPrivateResult(parsed)

    const envelope = payload?.sfxEvent
    if (envelope === null || typeof envelope !== "object") return
    const accountId = currentAccountId()
    if (accountId === null || envelope.accountId !== accountId) return
    if (envelope.gameId !== current.gameId) return
    const kind = parsed.actionType === "ASSASSINATE" ? "night-private-failure" : "night-private-result"
    playGameSfx(kind, envelope.eventId, current.gameId, envelope.origin ?? "restore")
  }

  // 밤 역할 차례 시작 (효과음 포함)
  const nightTurnStarted = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const parsed = parseNightTurnStartedPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
    })
    if (!parsed) return
    useInGameStore.getState().applyNightTurnStarted(parsed)
    playGameSfx(
      "night-turn-started",
      `game:${current.gameId}:day:${parsed.dayIndex}:nightturn:${parsed.role}`,
      current.gameId,
      originOf(payload),
    )
  }

  // 밤 역할 차례 끝
  const nightTurnEnded = (payload) => {
    if (!isCurrent()) return
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return
    const parsed = parseNightTurnEndedPayload({
      payload,
      gameId: current.gameId,
      dayIndex: current.state.dayIndex,
      nightTurnRole: current.state.nightTurnRole,
    })
    if (!parsed) return
    useInGameStore.getState().applyNightTurnEnded(parsed)
  }

  // 밤 성공 연출 받기 (받은 범위를 같이 넘김)
  const nightActionSuccess = (payload) => {
    if (!isCurrent()) return
    useInGameStore.getState().receiveNightSuccess(payload, currentReceiptScope())
  }

  // 연출 대기 알림 받기
  const nightPresentationWait = (payload) => {
    if (!isCurrent()) return
    useInGameStore.getState().receiveNightPresentationWait(payload, currentReceiptScope())
  }

  return {
    nightResultApplied,
    nightActionResult,
    nightTurnStarted,
    nightTurnEnded,
    nightActionSuccess,
    nightPresentationWait,
  }
}
