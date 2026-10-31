import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { computeRoleRevealInvalidatePatch } from "../utils/computeRoleRevealInvalidatePatch.js"

const ACK_TIMEOUT_MS = 5000

export function useInGameRoleRevealAck() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)

  const ackingRef = useRef(false)
  const ackedRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    ackedRef.current = false
    const patch = computeRoleRevealInvalidatePatch(mountedRef.current)
    if (!patch) return
    setStatus(patch.status)
    setError(patch.error)
  }

  useEffect(() => {
    if (!socket) return
    const handleDisconnect = () => invalidate()
    const handleConnect = () => acknowledge()
    socket.on("disconnect", handleDisconnect)
    socket.on("connect", handleConnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
      socket.off("connect", handleConnect)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  useEffect(() => {
    invalidate()
    if (gameId) acknowledge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  const acknowledge = () => {
    if (ackingRef.current || ackedRef.current) return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId) return

    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId

    ackingRef.current = true
    setStatus("acking")
    setError(null)

    const isStale = () =>
      isStaleRoleRevealAckResponse({
        mounted: mountedRef.current,
        requestVersion,
        currentVersion: versionRef.current,
        requestSocket,
        currentSocket: getSocket(),
        requestGameId,
        currentGameId: useInGameStore.getState().gameId,
      })

    requestSocket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("acknowledge_role_reveal", { gameId: requestGameId })
      .then((response) => {
        if (isStale()) return
        if (response?.ok) {
          ackedRef.current = true
          setStatus("acked")
        } else {
          setStatus("idle")
          setError(response?.message ?? "역할 확인을 처리하지 못했습니다.")
        }
      })
      .catch(() => {
        if (!isStale()) {
          setStatus("idle")
          setError("요청이 응답하지 않습니다. 다시 시도해주세요.")
        }
      })
      .finally(() => {
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, acknowledge }
}
