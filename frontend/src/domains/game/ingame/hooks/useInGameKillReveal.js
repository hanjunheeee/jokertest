import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameIdentityScopeVersion,
  isSameInGameReceiptScope,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
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
const NO_SNAPSHOT_ITEMS = Object.freeze([])

export function useInGameKillReveal({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const players = useInGameStore((s) => s.state?.players ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  // F-23(AC-05): 계정 **값**만으로는 A→B→A를 구별할 수 없고, 같은 판에 다시 들어온 새 소속은
  // 계정·게임이 그대로다. 두 값을 연출 범위에 함께 넣어 이전 신분의 큐가 새 신분으로 넘어오지
  // 않게 한다(useInGameSessionSnapshotSync·createLeaveGameSessionRequest와 같은 신원 축이다).
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const membershipId = useInGameStore((s) => {
    const me = s.state?.self?.uuid ?? null
    if (!me) return null
    return (s.state?.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
  })
  // F-23(SPLIT-1): 값이 원래대로 돌아오는 소속 왕복(A→B→A)은 위 값만으로는 드러나지 않는다 —
  // store가 set마다 동기적으로 기록한 전이 **횟수**를 연출 범위에 함께 넣는다.
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  // F-23(AC-05): 재접속 스냅샷이 복원한 **공개** 밤 결과. 라이브 방송을 놓친 연결이 그 밤의
  // 사망 연출을 회복하는 유일한 입력이다(applySessionSnapshotPure가 정규화해 둔 값).
  const snapshotNightResult = useInGameStore((s) => s.state?.nightResult ?? null)
  // F-23(AC-05/SPLIT-1): 그 공개 결과를 **누가·어느 연결에서** 받았는가. 이 증거가 지금 범위와
  // 정확히 같을 때만 연출을 만든다 — 잔존 nightResult에 새 범위의 서명을 붙이지 않는다.
  const snapshotResultOwner = useInGameStore((s) => s.snapshotResultOwner)
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(다른 오버레이 훅들과 동일한 관례).
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => setConnectSeq((current) => current + 1)
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}#${identityGeneration}#${membershipId}#${identityScopeVersion}`
  const scope = gameId && authUuid ? `${gameId}|${authUuid}|${epochKey}` : null

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_KILL_REVEAL)

  /**
   * 지금 이 순간의 수신 범위. 라이브 콜백과 consume이 "등록 당시"와 대조하는 기준이다.
   * 렌더 값이 아니라 호출 시점에 다시 읽는다 — 구독자에게 알리지 않은 단일 값 교체(직접
   * mutate)도 그대로 드러난다.
   */
  const readScopeNow = useCallback(() => readInGameReceiptScope({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  }), [])

  // 표시 scope는 렌더 값으로, 수신 scope는 호출 시점 값으로 본다. 두 기준을 ref로 들고 있어야
  // effect 정리 전에 실행되는 옛 콜백·consume이 현재 큐를 건드리지 못한다.
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  /** 이 렌더의 범위. 아래 consume 콜백이 자기가 태어난 범위를 기억하는 자리다. */
  const capturedScope = scope

  /**
   * 스냅샷이 복원한 공개 결과로부터 만든 큐 항목. **렌더 중에** 계산한다(effect가 아니라).
   *
   * 이유는 아래 pending이다. ENDED 스냅샷으로 복원된 판에서는 같은 렌더에 InGamePage가
   * useInGameResultNavigation을 부르는데, 큐 반영을 effect에만 맡기면 그 렌더에서는 pending이
   * false라 결과 페이지로 먼저 넘어가고 복원된 연출이 통째로 잘린다.
   *
   * 항목 id는 라이브 경로와 **같은 형식**이다(buildInGameKillRevealQueueItems 하나만 쓴다) —
   * 그래서 라이브→스냅샷, 스냅샷→라이브 어느 순서로 같은 사망이 들어와도 큐 증가는 0이다.
   *
   * F-23(SPLIT-1): 값이 남아 있다는 사실만으로는 만들지 않는다. 그 결과를 **이 신원·이 연결이
   * 실제로 받았다**는 증거(snapshotResultOwner)가 지금 범위와 모든 축에서 같아야 한다. 계정·
   * 소속·연결이 바뀐 뒤 잔존한 nightResult는 증거가 어긋나므로 연출이 되지 않고, 새 연결에서
   * 다시 요청해 검증한 같은 사망은 그 연결의 새 증거로 정상 복구된다.
   */
  const snapshotItems = useMemo(() => {
    if (!scope || !snapshotNightResult) return NO_SNAPSHOT_ITEMS
    if (!snapshotResultOwner) return NO_SNAPSHOT_ITEMS
    if (snapshotResultOwner.snapshotSeq !== snapshotSeq) return NO_SNAPSHOT_ITEMS
    if (!isSameInGameReceiptScope(snapshotResultOwner, readInGameReceiptScope({
      accountId: authUuid, identityGeneration,
    }))) {
      return NO_SNAPSHOT_ITEMS
    }
    const canonicalPlayerIds = new Set((players ?? []).map((player) => player.uuid))
    const items = buildInGameKillRevealQueueItems({
      gameId, authUuid, epoch: epochKey, nightResult: snapshotNightResult,
    }).filter((item) => canonicalPlayerIds.has(item.victimUuid))
    return items.length > 0 ? items : NO_SNAPSHOT_ITEMS
  }, [
    scope, snapshotNightResult, snapshotResultOwner, snapshotSeq, players,
    gameId, authUuid, identityGeneration, epochKey,
  ])

  // scope(게임·계정·소속·소켓 세대) 또는 hold가 바뀔 때마다 큐를 재평가한다 — 새 항목 없이도
  // 대기 중이던 연출을 승격/보류하거나(예: 역할 공개가 닫히는 순간), scope 변경 시 이전
  // 세션의 큐를 통째로 버린다. 스냅샷 복원 항목도 같은 경계에서 들어간다.
  useEffect(() => {
    setPresentation((current) => reduceInGameKillReveal(current, { scope, items: snapshotItems, hold }))
  }, [scope, hold, snapshotItems])

  useEffect(() => {
    if (!socket || !scope) return undefined

    // 이 구독이 등록된 **그 순간**의 수신 범위. 사건이 도착했을 때와 setPresentation updater
    // 안에서 각각 다시 맞춰 본다 — effect 정리가 아직 돌지 않은 구간에 도착한 옛 연결의
    // 사건이 새 신원의 큐를 바꾸지 못하게 한다(정리 시점에 기대지 않는 방어다).
    const registeredScope = scope
    const registeredReceipt = readScopeNow()
    const isCurrentReceipt = () =>
      scopeRef.current === registeredScope && isSameInGameReceiptScope(registeredReceipt, readScopeNow())

    const enqueue = (items) => {
      if (items.length === 0) return
      if (!isCurrentReceipt()) return
      setPresentation((current) => {
        if (!isCurrentReceipt()) return current
        return reduceInGameKillReveal(current, { scope: registeredScope, items, hold })
      })
    }

    const handleNightResultApplied = (payload) => {
      if (!isCurrentReceipt()) return
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
      if (!isCurrentReceipt()) return
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
  }, [socket, scope, authUuid, epochKey, hold, readScopeNow])

  /**
   * F-23(SPLIT-1): 표시도 범위에 묶인다.
   *
   * 범위가 바뀐 렌더에서 위 effect(큐 재평가)는 **아직 돌지 않았다**. 그 한 렌더 동안 이전
   * 신분의 active·message·pending을 그대로 내보내면, 새 신분의 화면에 이전 신분의 사망 연출이
   * 한 장 스쳐 지나가고 결과 이동까지 함께 미뤄진다. 그래서 읽는 쪽에서 먼저 잘라낸다 —
   * effect가 돌면 reduceInGameKillReveal이 같은 판단으로 상태 자체를 비운다.
   */
  const visible = presentation.scope === scope ? presentation : INITIAL_IN_GAME_KILL_REVEAL

  const activeItem = visible.active
  const nickname = resolveInGameKillRevealNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildInGameKillRevealMessage(activeItem.source, nickname) : null

  // 지금 떠 있는 항목의 id를 캡슐화한다 — 이전 항목의 늦은 ended/에러/워치독 콜백은 id
  // 불일치로 아무 일도 하지 않는다(consumeInGameKillReveal 참고).
  //
  // F-23(SPLIT-1): id만으로는 부족하다. 범위가 바뀐 뒤 도착한 옛 오버레이의 종료 콜백은 그
  // 시점 큐의 맨 앞(새 신분의 첫 연출)을 대신 소비해버릴 수 있다. 캡처한 scope·현재 scope·
  // 큐가 들고 있는 scope 셋이 모두 같을 때만 소비한다.
  const consume = useCallback((targetId) => {
    // capturedScope는 이 콜백이 **만들어진 렌더**의 범위다(호출 시점이 아니다) — 이전 신분의
    // 오버레이가 들고 있던 consume이 새 신분의 큐를 건드리지 못하는 근거가 여기에 있다.
    if (capturedScope === null) return
    setPresentation((current) => {
      if (scopeRef.current !== capturedScope) return current
      if (current.scope !== capturedScope) return current
      return consumeInGameKillReveal(current, targetId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedScope])

  // 이번 렌더 기준으로 "스냅샷이 복원했지만 아직 이 scope의 큐에 들어가지도 않은" 연출이 있는가.
  // 위 useMemo 주석의 이유로, 큐에 들어가기 **전**부터 pending이어야 결과 이동이 기다린다.
  // 이미 소비된 항목은 seenIds에 있으므로 여기서 다시 pending을 만들지 않는다(이동 1회 보장).
  const hasUnqueuedSnapshotReveal = snapshotItems.some((item) => !visible.seenIds.includes(item.id))

  return {
    open: activeItem !== null,
    // 아직 재생하지 못하고 큐에 남아 있는 연출이 있는가. 정상 흐름에서는 consume이 다음 항목을
    // 같은 setState에서 곧바로 승격하므로 open만으로 충분하지만, hold(자기 역할 재열람)가 걸린
    // 순간에는 active가 비고 queue만 남아 open===false가 된다 — 그 상태를 "연출 끝"으로 오인해
    // 결과 페이지로 넘어가지 않도록 큐 잔량을 그대로 노출한다. 재생 로직은 손대지 않는 파생 값이다.
    pending: hasPendingInGameKillReveal(visible) || hasUnqueuedSnapshotReveal,
    revealId: activeItem?.id ?? null,
    message,
    consume,
  }
}
