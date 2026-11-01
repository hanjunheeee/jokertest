// 사망 공개 훅: 밤 결과·재판 판정으로 죽은 사람을 차례로 띄우기 (스냅샷 복구분 포함)
// 지금은 시험만 사용 (인게임 화면엔 안 붙음), 받기는 socket/ 함수를 부름
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getIdentityScopeVersion,
  isSameReceiptScope,
  readInGameReceiptScope,
  subscribeIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import { buildInGameKillRevealQueueItems } from "../utils/nightDeathReveals.js"
import {
  consumeInGameKillReveal,
  hasPendingInGameKillReveal,
  INITIAL_IN_GAME_KILL_REVEAL,
  reduceInGameKillReveal,
} from "../utils/reduceInGameKillReveal.js"
import {
  buildRevealMsg,
  TRIBUNAL_SOURCE,
  resolveRevealNickname,
} from "../constants/ingameKillReveal.js"
import { onConnect } from "../socket/connection.js"
import { onDeathResults } from "../socket/session.js"

// 스냅샷 몫이 없을 때 늘 같은 빈 배열 (memo 값이 괜히 안 바뀌게)
const NO_SNAPSHOT_ITEMS = Object.freeze([])

// 지금 띄울 사망 공개와 다 봤다고 넘기기 (hold면 대기열에만 둠)
export function useInGameKillReveal({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const players = useInGameStore((s) => s.state?.players ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const membershipId = useInGameStore((s) => {
    const me = s.state?.self?.uuid ?? null
    if (!me) return null
    return (s.state?.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
  })
  const identityScopeVersion = useSyncExternalStore(
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )
  const snapshotNightResult = useInGameStore((s) => s.state?.nightResult ?? null)
  const snapshotResultOwner = useInGameStore((s) => s.snapshotResultOwner)
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 다시 연결될 때마다 범위를 새로 잡으려고 셈
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    return onConnect(socket, () => setConnectSeq((current) => current + 1))
  }, [socket])

  // 판·계정·소켓 세대·연결 횟수·신원·소속을 묶은 범위 (바뀌면 대기열 처음부터)
  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}#${identityGeneration}#${membershipId}#${identityScopeVersion}`
  const scope = gameId && authUuid ? `${gameId}|${authUuid}|${epochKey}` : null

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_KILL_REVEAL)

  // 지금 계정 기준 수신 범위 읽기
  const readScopeNow = useCallback(() => readInGameReceiptScope({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  }), [])

  // 콜백이 지금 범위와 비교하려고 ref에도 둠
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const capturedScope = scope

  // 스냅샷 밤 결과에서 사망 공개 만들기 (판에 있는 사람만)
  const snapshotItems = useMemo(() => {
    // 범위·밤 결과·주인이 없거나 이번 스냅샷·내 수신 범위 것이 아니면 없음
    if (!scope || !snapshotNightResult) return NO_SNAPSHOT_ITEMS
    if (!snapshotResultOwner) return NO_SNAPSHOT_ITEMS
    if (snapshotResultOwner.snapshotSeq !== snapshotSeq) return NO_SNAPSHOT_ITEMS
    if (!isSameReceiptScope(snapshotResultOwner, readInGameReceiptScope({
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

  // 범위·멈춤·스냅샷 몫이 바뀌면 대기열 다시 계산
  useEffect(() => {
    setPresentation((current) => reduceInGameKillReveal(current, { scope, items: snapshotItems, hold }))
  }, [scope, hold, snapshotItems])

  // 밤 결과 적용·재판 판정 받아 대기열에 넣기 (붙인 때 범위 그대로일 때만)
  useEffect(() => {
    if (!socket || !scope) return undefined

    const registeredScope = scope
    const registeredReceipt = readScopeNow()
    const isCurrentReceipt = () =>
      scopeRef.current === registeredScope && isSameReceiptScope(registeredReceipt, readScopeNow())

    // 넣는 순간에도 범위를 한 번 더 봄
    const enqueue = (items) => {
      if (items.length === 0) return
      if (!isCurrentReceipt()) return
      setPresentation((current) => {
        if (!isCurrentReceipt()) return current
        return reduceInGameKillReveal(current, { scope: registeredScope, items, hold })
      })
    }

    // 밤 결과: 범위·판·모양이 맞으면 판에 있는 죽은 사람들 넣기
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

    // 재판: 유죄로 처형된 사람이 판에 있을 때만 넣기 (무죄·취소는 버림)
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

      // 판·날짜·처형자·출처·계정·범위로 id를 만들어 같은 공개가 두 번 안 들어가게 함
      const source = TRIBUNAL_SOURCE
      enqueue([
        {
          id: `${store.gameId}|${payload.dayIndex}|${payload.executedUuid}|${source}|${authUuid}|${epochKey}`,
          victimUuid: payload.executedUuid,
          source,
        },
      ])
    }

    return onDeathResults(socket, handleNightResultApplied, handleTribunalVoteResolved)
  }, [socket, scope, authUuid, epochKey, hold, readScopeNow])

  // 다른 범위 대기열이면 안 보임
  const visible = presentation.scope === scope ? presentation : INITIAL_IN_GAME_KILL_REVEAL

  // 지금 공개 하나의 닉네임·문구 (밤·재판 출처별 문구)
  const activeItem = visible.active
  const nickname = resolveRevealNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildRevealMsg(activeItem.source, nickname) : null

  // 다 봤다고 넘기기 (그사이 범위가 바뀌었으면 무시)
  const consume = useCallback((targetId) => {
    if (capturedScope === null) return
    setPresentation((current) => {
      if (scopeRef.current !== capturedScope) return current
      if (current.scope !== capturedScope) return current
      return consumeInGameKillReveal(current, targetId)
    })
  }, [capturedScope])

  // 스냅샷 몫 중 아직 대기열에 안 들어간 게 있으면 기다리는 중으로 봄
  const hasUnqueuedSnapReveal = snapshotItems.some((item) => !visible.seenIds.includes(item.id))

  return {
    open: activeItem !== null,
    pending: hasPendingInGameKillReveal(visible) || hasUnqueuedSnapReveal,
    revealId: activeItem?.id ?? null,
    message,
    consume,
  }
}
