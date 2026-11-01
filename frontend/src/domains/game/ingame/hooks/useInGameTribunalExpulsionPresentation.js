// 재판 추방 연출 훅: 유죄 판정으로 쫓겨난 사람을 차례로 띄우기
// 인게임 화면(InGamePage)이 사용, 받기는 socket/ 함수를 부름
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getIdentityScopeVersion,
  readInGameReceiptScope,
  subscribeIdentityScope,
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
} from "../constants/ingameTribunalExpulsionPresentation.js"
import { onConnect } from "../socket/connection.js"
import { onTribunalResolved } from "../socket/tribunal.js"

// 지금 띄울 추방 연출과 다 봤다고 넘기기 (hold면 대기열에만 둠)
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
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )
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

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_TRIBUNAL_EXPULSION)
  // 콜백이 지금 범위와 비교하려고 ref에도 둠
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const capturedScope = scope

  // 지금 계정 기준 수신 범위 읽기
  const readScopeNow = useCallback(() => readInGameReceiptScope({
    accountId: useAuthStore.getState().user?.uuid ?? null,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  }), [])

  // 범위·멈춤이 바뀌면 대기열 다시 계산 (범위 바뀌면 비움)
  useEffect(() => {
    setPresentation((current) =>
      reduceInGameTribunalExpulsionPresentation(current, { scope, items: [], hold }),
    )
  }, [scope, hold])

  // 재판 판정 받아 대기열에 넣기 (소켓·범위·계정 없으면 안 받음)
  useEffect(() => {
    if (!socket || !scope || !authUuid) return undefined

    const enqueue = (items) => {
      if (!Array.isArray(items) || items.length === 0) return
      setPresentation((current) =>
        reduceInGameTribunalExpulsionPresentation(current, { scope, items, hold }),
      )
    }

    // 붙인 때 계정·신원 세대가 아직 그대로인지
    const isCurrentReceipt = () => {
      const receipt = readScopeNow()
      return receipt.accountId === authUuid
        && receipt.identityGeneration === useAuthStore.getState().identityGeneration
    }

    // 유죄로 처형된 사람이 판에 있을 때만 넣기 (무죄·취소·다른 판은 버림)
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

      // 판·날짜·처형자·계정·범위로 id를 만들어 같은 연출이 두 번 안 들어가게 함
      enqueue([
        {
          id: `${store.gameId}|${payload.dayIndex}|${payload.executedUuid}|TRIBUNAL_EXPULSION|${authUuid}|${epochKey}`,
          victimUuid: payload.executedUuid,
        },
      ])
    }

    return onTribunalResolved(socket, handleTribunalVoteResolved)
  }, [socket, scope, authUuid, epochKey, hold, readScopeNow])

  // 다른 범위 대기열이면 안 보임, 보이는 것은 닉네임 넣은 문구로
  const visible = presentation.scope === scope ? presentation : INITIAL_IN_GAME_TRIBUNAL_EXPULSION
  const activeItem = visible.active
  const nickname = resolveInGameTribunalExpulsionNickname(players, activeItem?.victimUuid ?? null)
  const message = activeItem ? buildInGameTribunalExpulsionMessage(nickname) : null

  // 다 봤다고 넘기기 (그사이 범위가 바뀌었으면 무시)
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
