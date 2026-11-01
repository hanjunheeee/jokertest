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

const NO_SNAPSHOT_ITEMS = Object.freeze([])

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

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}#${identityGeneration}#${membershipId}#${identityScopeVersion}`
  const scope = gameId && authUuid ? `${gameId}|${authUuid}|${epochKey}` : null

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_KILL_REVEAL)

  const readScopeNow = useCallback(() => readInGameReceiptScope({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  }), [])

  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const capturedScope = scope

  const snapshotItems = useMemo(() => {
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

  useEffect(() => {
    setPresentation((current) => reduceInGameKillReveal(current, { scope, items: snapshotItems, hold }))
  }, [scope, hold, snapshotItems])

  useEffect(() => {
    if (!socket || !scope) return undefined

    const registeredScope = scope
    const registeredReceipt = readScopeNow()
    const isCurrentReceipt = () =>
      scopeRef.current === registeredScope && isSameReceiptScope(registeredReceipt, readScopeNow())

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

  const visible = presentation.scope === scope ? presentation : INITIAL_IN_GAME_KILL_REVEAL

  const activeItem = visible.active
  const nickname = resolveRevealNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildRevealMsg(activeItem.source, nickname) : null

  const consume = useCallback((targetId) => {
    if (capturedScope === null) return
    setPresentation((current) => {
      if (scopeRef.current !== capturedScope) return current
      if (current.scope !== capturedScope) return current
      return consumeInGameKillReveal(current, targetId)
    })
  }, [capturedScope])

  const hasUnqueuedSnapReveal = snapshotItems.some((item) => !visible.seenIds.includes(item.id))

  return {
    open: activeItem !== null,
    pending: hasPendingInGameKillReveal(visible) || hasUnqueuedSnapReveal,
    revealId: activeItem?.id ?? null,
    message,
    consume,
  }
}
