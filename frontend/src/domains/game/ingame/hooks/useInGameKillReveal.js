import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import { buildInGameKillRevealQueueItems } from "../utils/buildInGameKillRevealQueueItems.js"
import {
  consumeInGameKillReveal,
  hasPendingInGameKillReveal,
  INITIAL_IN_GAME_KILL_REVEAL,
  reduceInGameKillReveal,
} from "../utils/reduceInGameKillReveal.js"
import {
  buildInGameKillRevealMessage,
  INGAME_KILL_REVEAL_TRIBUNAL_SOURCE,
  resolveInGameKillRevealNickname,
} from "../constants/killReveal/ingameKillReveal.js"

/**
 * 사망 공개 연출(kill reveal) 큐의 표시 상태를 관리한다.
 *
 * 두 canonical 사망 경로를 함께 듣는다:
 *   - night_result_applied 의 공개 deathReveals(밤 사망)
 *   - tribunal_vote_resolved 의 executedUuid(낮 재판 처형)
 *
 * 두 방송 모두 이 훅이 직접, 독립적으로 구독한다(useGameSessionSocketEvents의 구독과는 별개의
 * 리스너 — 그쪽 핸들러를 대체하지도, 건드리지도 않는다). canonical store는 밤 방송의 공개
 * 사망 연출(payload.deathReveals)을 어디에도 보관하지 않으므로
 * (parseNightResultAppliedPayload/ingameStore 모두 이 필드를 다루지 않는다), 표시 전용인 이
 * 훅이 필요한 조각만 별도로 읽어 로컬 큐로만 반영한다 — socket emit·REST·canonical store
 * 변경은 전혀 없다.
 *
 * 신뢰 경계: 이벤트 도착 시점에 store에서 다시 읽은 gameId와 정확히 일치하는 payload만
 * 받아들이고, 희생자 uuid는 그 시점 canonical roster에 있는 것만 통과시킨다.
 *
 * 반환값의 pending은 "아직 재생하지 못한 연출이 남아 있다"는 파생 읽기다(재생 로직과 무관) —
 * ENDED 전이가 사망 연출을 자르지 않고 기다리는 판단(useInGameResultNavigation)에 쓰인다.
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 더 높은 우선순위 오버레이(자기 역할 공개)가 떠 있는가. true인
 *   동안에는 다음 연출을 띄우지 않되 "소비됨"으로도 처리하지 않는다.
 */
export function useInGameKillReveal({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const players = useInGameStore((s) => s.state?.players ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(다른 오버레이 훅들과 동일한 관례).
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => setConnectSeq((current) => current + 1)
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}`
  const scope = gameId && authUuid ? `${gameId}|${authUuid}|${epochKey}` : null

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_KILL_REVEAL)

  // scope(게임·계정·소켓 세대) 또는 hold가 바뀔 때마다 큐를 재평가한다 — 새 항목 없이도
  // 대기 중이던 연출을 승격/보류하거나(예: 역할 공개가 닫히는 순간), scope 변경 시 이전
  // 세션의 큐를 통째로 버린다.
  useEffect(() => {
    setPresentation((current) => reduceInGameKillReveal(current, { scope, items: [], hold }))
  }, [scope, hold])

  useEffect(() => {
    if (!socket || !scope) return undefined

    const enqueue = (items) => {
      if (items.length === 0) return
      setPresentation((current) => reduceInGameKillReveal(current, { scope, items, hold }))
    }

    const handleNightResultApplied = (payload) => {
      const store = useInGameStore.getState()
      if (!store.gameId || !store.state) return
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      if (payload.gameId !== store.gameId) return
      if (!Number.isInteger(payload.dayIndex)) return

      const canonicalPlayerIds = new Set((store.state.players ?? []).map((p) => p.uuid))
      const items = buildInGameKillRevealQueueItems({
        gameId: store.gameId,
        authUuid,
        epoch: epochKey,
        nightResult: { dayIndex: payload.dayIndex, deathReveals: payload.deathReveals },
      }).filter((item) => canonicalPlayerIds.has(item.victimUuid))
      enqueue(items)
    }

    // 재판 처형은 밤 판정이 아니므로 deathReveals를 타고 오지 않는다 — GUILTY 판정의
    // executedUuid 하나가 곧 그 낮의 공개 사망이다. 항목 id는 밤 경로와 정확히 같은 형식으로
    // 만든다(buildInGameKillRevealQueueItems 참고) — 형식이 갈리면 같은 사망이 두 경로에서
    // 서로 다른 id로 들어와 연출이 두 번 재생될 수 있다.
    const handleTribunalVoteResolved = (payload) => {
      const store = useInGameStore.getState()
      if (!store.gameId || !store.state) return
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      if (payload.gameId !== store.gameId) return
      if (!Number.isInteger(payload.dayIndex)) return
      if (payload.outcome !== "GUILTY") return
      if (typeof payload.executedUuid !== "string" || payload.executedUuid.length === 0) return

      const canonicalPlayerIds = new Set((store.state.players ?? []).map((p) => p.uuid))
      if (!canonicalPlayerIds.has(payload.executedUuid)) return

      const source = INGAME_KILL_REVEAL_TRIBUNAL_SOURCE
      enqueue([
        {
          id: `${store.gameId}|${payload.dayIndex}|${payload.executedUuid}|${source}|${authUuid}|${epochKey}`,
          victimUuid: payload.executedUuid,
          source,
        },
      ])
    }

    socket.on("night_result_applied", handleNightResultApplied)
    socket.on("tribunal_vote_resolved", handleTribunalVoteResolved)
    return () => {
      socket.off("night_result_applied", handleNightResultApplied)
      socket.off("tribunal_vote_resolved", handleTribunalVoteResolved)
    }
  }, [socket, scope, authUuid, epochKey, hold])

  const activeItem = presentation.active
  const nickname = resolveInGameKillRevealNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildInGameKillRevealMessage(activeItem.source, nickname) : null

  // 지금 떠 있는 항목의 id를 캡슐화한다 — 이전 항목의 늦은 ended/에러/워치독 콜백은 id
  // 불일치로 아무 일도 하지 않는다(consumeInGameKillReveal 참고).
  const consume = useCallback((targetId) => {
    setPresentation((current) => consumeInGameKillReveal(current, targetId))
  }, [])

  return {
    open: activeItem !== null,
    // 아직 재생하지 못하고 큐에 남아 있는 연출이 있는가. 정상 흐름에서는 consume이 다음 항목을
    // 같은 setState에서 곧바로 승격하므로 open만으로 충분하지만, hold(자기 역할 재열람)가 걸린
    // 순간에는 active가 비고 queue만 남아 open===false가 된다 — 그 상태를 "연출 끝"으로 오인해
    // 결과 페이지로 넘어가지 않도록 큐 잔량을 그대로 노출한다. 재생 로직은 손대지 않는 파생 값이다.
    pending: hasPendingInGameKillReveal(presentation),
    revealId: activeItem?.id ?? null,
    message,
    consume,
  }
}
