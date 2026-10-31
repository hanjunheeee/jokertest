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
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const snapshotNightResult = useInGameStore((s) => s.state?.nightResult ?? null)
  const snapshotResultOwner = useInGameStore((s) => s.snapshotResultOwner)
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

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

  useEffect(() => {
    setPresentation((current) => reduceInGameKillReveal(current, { scope, items: snapshotItems, hold }))
  }, [scope, hold, snapshotItems])

  useEffect(() => {
    if (!socket || !scope) return undefined

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

  const visible = presentation.scope === scope ? presentation : INITIAL_IN_GAME_KILL_REVEAL

  const activeItem = visible.active
  const nickname = resolveInGameKillRevealNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildInGameKillRevealMessage(activeItem.source, nickname) : null

  const consume = useCallback((targetId) => {
    if (capturedScope === null) return
    setPresentation((current) => {
      if (scopeRef.current !== capturedScope) return current
      if (current.scope !== capturedScope) return current
      return consumeInGameKillReveal(current, targetId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedScope])

  const hasUnqueuedSnapshotReveal = snapshotItems.some((item) => !visible.seenIds.includes(item.id))

  return {
    open: activeItem !== null,
    pending: hasPendingInGameKillReveal(visible) || hasUnqueuedSnapshotReveal,
    revealId: activeItem?.id ?? null,
    message,
    consume,
  }
}
