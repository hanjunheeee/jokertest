// 역할 확인 알림 훅: 판에 들어오거나 다시 연결되면 역할 봤다고 한 번 알림
// 역할 공개 훅(useInGameRoleReveal)이 사용, 보내기·연결 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import { computeRoleRevealInvalidatePatch } from "../utils/roleReveal.js"
import { onConnect, onDisconnect } from "../socket/connection.js"
import { emitRoleRevealAck } from "../socket/session.js"

// 알림 응답 기다리는 시간
const ACK_TIMEOUT_MS = 5000

// 알림 상태·오류와 알림 보내기 함수
export function useInGameRoleRevealAck() {
  const gameId = useInGameStore((s) => s.gameId)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)

  // 보내는 중·받아들여짐·요청 세대·화면 살아 있음
  const ackingRef = useRef(false)
  const ackedRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  // 화면 빠진 뒤엔 상태 안 바꾸게 표시
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

  // 끊기면 처음으로, 다시 연결되면 다시 알림 (판이 바뀌면 지금 판으로 다시 붙임)
  useEffect(() => {
    if (!socket) return
    const offDisconnect = onDisconnect(socket, () => invalidate())
    const offConnect = onConnect(socket, () => acknowledge())
    return () => {
      offDisconnect()
      offConnect()
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId])

  // 판이 바뀌면 처음으로 하고 판이 있으면 바로 알림
  useEffect(() => {
    invalidate()
    if (gameId) acknowledge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // 알림 보내기 (보내는 중이거나 이미 받아들여졌으면 막기)
  const acknowledge = () => {
    if (ackingRef.current || ackedRef.current) return
    const requestSocket = getSocket()
    // 연결 없으면 오류 문구, 판 없으면 안 보냄
    if (!requestSocket || !requestSocket.connected) {
      setError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId) return

    // 요청 세대·판 잡아 둠 (응답 때 비교)
    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId

    ackingRef.current = true
    setStatus("acking")
    setError(null)

    // 화면·세대·소켓·연결·판 중 하나라도 바뀌면 옛 응답
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

    // 받아들여지면 다시 안 보냄, 거절·시간 초과면 오류 문구 (옛 응답은 버림)
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
      // 마지막 요청일 때만 보내는 중 풂
      .finally(() => {
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, acknowledge }
}
