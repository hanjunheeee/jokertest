// 단계 입장 안내 훅: 낮·밤·재판으로 바뀔 때 안내를 띄우고 확인받기
// 오버레이 묶음 훅(useInGameOverlayStack)이 사용, 다시 연결 받기는 socket/connection.js를 부름
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGamePhaseEntranceMessage } from "../constants/phaseEntrance/ingamePhaseEntrance.js"
import {
  buildInGamePhaseEntranceIdentity,
  buildInGamePhaseEntranceScope,
} from "../utils/buildInGamePhaseEntranceIdentity.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import {
  confirmInGamePhaseEntrance,
  INITIAL_IN_GAME_PHASE_ENTRANCE,
  reduceInGamePhaseEntrance,
} from "../utils/reduceInGamePhaseEntrance.js"
import { onConnect } from "../socket/connection.js"

export function useInGamePhaseEntrance({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex ?? null)
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 다시 연결될 때마다 범위를 새로 잡으려고 셈
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    return onConnect(socket, () => setConnectSeq((current) => current + 1))
  }, [socket])

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}`
  const scope = buildInGamePhaseEntranceScope({ gameId, authUuid, epochKey })
  const identity = buildInGamePhaseEntranceIdentity(scope, phase, dayIndex)

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_PHASE_ENTRANCE)
  const lastSnapshotSeqRef = useRef(snapshotSeq)

  useEffect(() => {
    const hydrated = lastSnapshotSeqRef.current !== snapshotSeq
    lastSnapshotSeqRef.current = snapshotSeq
    setPresentation((current) =>
      reduceInGamePhaseEntrance(current, { scope, identity, phase, dayIndex, hold, hydrated }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, identity, hold, snapshotSeq])

  const activeIdentity = presentation.active?.identity ?? null
  const activePhase = presentation.active?.phase ?? null

  const confirm = useCallback(() => {
    setPresentation((current) => confirmInGamePhaseEntrance(current, activeIdentity))
  }, [activeIdentity])

  return {
    open: presentation.active !== null,
    phase: activePhase,
    dayIndex: presentation.active?.dayIndex ?? null,
    message: getInGamePhaseEntranceMessage(activePhase),
    identity: activeIdentity,
    confirm,
    armed: presentation.pending !== null || presentation.active !== null,
    blocking: presentation.active !== null,
  }
}
