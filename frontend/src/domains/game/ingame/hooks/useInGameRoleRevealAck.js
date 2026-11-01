// 역할 확인 알림 훅: 판에 들어오거나 다시 연결되면 역할 봤다고 한 번 알림
// 역할 공개 훅(useInGameRoleReveal)이 사용, 보내기·연결 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import { computeRoleRevealInvalidatePatch } from "../utils/roleReveal.js"
import { onConnect, onDisconnect } from "../socket/connection.js"
import { emitRoleRevealAck } from "../socket/session.js"

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

  // 세대 올려서 보낸 알림의 응답을 버리고 다시 알릴 수 있게 함
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
    // 끊기면 처음으로, 다시 연결되면 다시 알림
    const offDisconnect = onDisconnect(socket, () => invalidate())
    const offConnect = onConnect(socket, () => acknowledge())
    return () => {
      offDisconnect()
      offConnect()
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  useEffect(() => {
    invalidate()
    if (gameId) acknowledge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // 알림 보내기 (보내는 중이거나 이미 받아들여졌으면 막기)
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

    emitRoleRevealAck(requestSocket, ACK_TIMEOUT_MS, requestGameId)
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
