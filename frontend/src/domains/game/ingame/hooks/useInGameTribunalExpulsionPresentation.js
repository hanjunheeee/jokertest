import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameIdentityScopeVersion,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import {
  consumeInGameTribunalExpulsionPresentation,
  hasPendingInGameTribunalExpulsionPresentation,
  INITIAL_IN_GAME_TRIBUNAL_EXPULSION,
  reduceInGameTribunalExpulsionPresentation,
} from "../utils/reduceInGameTribunalExpulsionPresentation.js"
import {
  buildInGameTribunalExpulsionMessage,
  resolveInGameTribunalExpulsionNickname,
} from "../constants/tribunalExpulsion/ingameTribunalExpulsionPresentation.js"

/**
 * TRIBUNAL GUILTY(가면무도회 추방) 연출 큐 — tribunal_vote_resolved만 독립 구독한다.
 * canonical store는 즉시 NIGHT로 넘어가도, 이 연출이 끝날 때까지 진입 연출·결과 이동을 지연한다.
 */
export function useInGameTribunalExpulsionPresentation({ hold = false } = {}) {
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

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_TRIBUNAL_EXPULSION)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const capturedScope = scope

  const readScopeNow = useCallback(() => readInGameReceiptScope({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  }), [])

  useEffect(() => {
    setPresentation((current) =>
      reduceInGameTribunalExpulsionPresentation(current, { scope, items: [], hold }),
    )
  }, [scope, hold])

  useEffect(() => {
    if (!socket || !scope || !authUuid) return undefined

    const enqueue = (items) => {
      if (!Array.isArray(items) || items.length === 0) return
      setPresentation((current) =>
        reduceInGameTribunalExpulsionPresentation(current, { scope, items, hold }),
      )
    }

    const isCurrentReceipt = () => {
      const receipt = readScopeNow()
      return receipt.accountId === authUuid
        && receipt.identityGeneration === useAuthStore.getState().identityGeneration
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

      enqueue([
        {
          id: `${store.gameId}|${payload.dayIndex}|${payload.executedUuid}|TRIBUNAL_EXPULSION|${authUuid}|${epochKey}`,
          victimUuid: payload.executedUuid,
        },
      ])
    }

    socket.on("tribunal_vote_resolved", handleTribunalVoteResolved)
    return () => socket.off("tribunal_vote_resolved", handleTribunalVoteResolved)
  }, [socket, scope, authUuid, epochKey, hold, readScopeNow])

  const visible = presentation.scope === scope ? presentation : INITIAL_IN_GAME_TRIBUNAL_EXPULSION
  const activeItem = visible.active
  const nickname = resolveInGameTribunalExpulsionNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildInGameTribunalExpulsionMessage(nickname) : null

  const consume = useCallback((targetId) => {
    if (capturedScope === null) return
    setPresentation((current) => {
      if (scopeRef.current !== capturedScope) return current
      if (current.scope !== capturedScope) return current
      return consumeInGameTribunalExpulsionPresentation(current, targetId)
    })
  }, [capturedScope])

  return {
    open: activeItem !== null,
    pending: hasPendingInGameTribunalExpulsionPresentation(visible),
    presentationId: activeItem?.id ?? null,
    message,
    consume,
  }
}
