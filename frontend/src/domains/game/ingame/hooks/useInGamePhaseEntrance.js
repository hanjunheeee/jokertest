// 단계 입장 안내 훅: 낮·밤·재판으로 바뀔 때 안내를 띄우고 확인받기
// 오버레이 묶음 훅(useInGameOverlayStack)이 사용, 다시 연결 받기는 socket/connection.js를 부름
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getEntranceMsg } from "../constants/ingamePhaseEntrance.js"
import { buildInGamePhaseEntranceIdentity, buildEntranceScope } from "../utils/overlayIdentity.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import {
  confirmPhaseEntrance,
  INITIAL_PHASE_ENTRANCE,
  reduceInGamePhaseEntrance,
} from "../utils/reduceInGamePhaseEntrance.js"
import { onConnect } from "../socket/connection.js"

// 단계 입장 안내 상태와 확인 (앞 연출 중이면 hold로 미룸)
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

  // 판·계정·연결 범위와 단계·날짜로 안내 하나를 가림
  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}`
  const scope = buildEntranceScope({ gameId, authUuid, epochKey })
  const identity = buildInGamePhaseEntranceIdentity(scope, phase, dayIndex)

  const [presentation, setPresentation] = useState(INITIAL_PHASE_ENTRANCE)
  // 스냅샷으로 바뀐 건지 가리려고 지난 순번 둠
  const lastSnapshotSeqRef = useRef(snapshotSeq)

  // 범위·안내·멈춤·스냅샷이 바뀌면 다시 계산 (스냅샷 복구로 온 단계는 안내 안 띄움)
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

  // 지금 안내 확인하고 닫기
  const confirm = useCallback(() => {
    setPresentation((current) => confirmPhaseEntrance(current, activeIdentity))
  }, [activeIdentity])

  // armed = 띄울 안내가 남아 있음 (밤 차례 안내를 미룸), blocking = 보이는 동안 조작 막음
  return {
    open: presentation.active !== null,
    phase: activePhase,
    dayIndex: presentation.active?.dayIndex ?? null,
    message: getEntranceMsg(activePhase),
    identity: activeIdentity,
    confirm,
    armed: presentation.pending !== null || presentation.active !== null,
    blocking: presentation.active !== null,
  }
}
