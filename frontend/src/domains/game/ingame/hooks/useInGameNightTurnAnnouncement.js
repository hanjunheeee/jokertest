import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getInGameNightTurnAnnouncement,
  INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS,
} from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import { selectInGameNightTurnRole } from "../utils/selectInGameNightTurnRole.js"
import {
  buildInGameNightTurnAnnouncementIdentity,
  buildInGameNightTurnAnnouncementScope,
} from "../utils/buildInGameNightTurnAnnouncementIdentity.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import {
  dismissInGameNightTurnAnnouncement,
  INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT,
  reduceInGameNightTurnAnnouncement,
} from "../utils/reduceInGameNightTurnAnnouncement.js"

export function useInGameNightTurnAnnouncement({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex ?? null)
  const nightTurnRole = useInGameStore((s) => selectInGameNightTurnRole(s.state ?? null))
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => setConnectSeq((current) => current + 1)
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}`
  const scope = buildInGameNightTurnAnnouncementScope({ gameId, authUuid, epochKey })
  const identity = buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, nightTurnRole)

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT)
  const lastSnapshotSeqRef = useRef(snapshotSeq)

  useEffect(() => {
    const hydrated = lastSnapshotSeqRef.current !== snapshotSeq
    lastSnapshotSeqRef.current = snapshotSeq
    setPresentation((current) =>
      reduceInGameNightTurnAnnouncement(current, {
        scope,
        identity,
        role: nightTurnRole,
        dayIndex,
        hold,
        hydrated,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, identity, hold, snapshotSeq])

  const activeIdentity = presentation.active?.identity ?? null
  const activeRole = presentation.active?.role ?? null

  const close = useCallback(() => {
    setPresentation((current) => dismissInGameNightTurnAnnouncement(current, activeIdentity))
  }, [activeIdentity])

  useEffect(() => {
    if (activeIdentity === null) return undefined
    const timer = setTimeout(() => {
      setPresentation((current) => dismissInGameNightTurnAnnouncement(current, activeIdentity))
    }, INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [activeIdentity])

  const announcement =
    activeRole !== null ? getInGameNightTurnAnnouncement(activeRole, presentation.active?.dayIndex ?? null) : null

  return {
    open: presentation.active !== null && announcement !== null,
    announcement,
    identity: activeIdentity,
    role: activeRole,
    close,
  }
}
