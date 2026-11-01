// 판 진행 연결 감시 훅 둘: 다시 연결 횟수 세기·내 연결이 끊기면 판 정리
// 판 진행 이벤트 훅(useGameSessionSocketEvents)이 정해진 순서로 부름
import { useEffect, useState } from "react"
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import { noteConnectionRebound, useInGameStore } from "../../store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "../../store/inGameEmojiBubble.store.js"
import { createSelfDisconnectHandler } from "../../utils/sessionEnd.js"
import { onConnect, onDisconnect } from "../../socket/connection.js"
import { buildFinalizer } from "./roomHandlers.js"

// 다시 연결될 때마다 횟수 올림 (구독을 새로 붙이는 신호), 연결 세대 올리고 말풍선 지움
export function useConnectSeq(socket) {
  const [seq, setSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => {
      setSeq((current) => current + 1)
      noteConnectionRebound()
      useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
    }
    return onConnect(socket, handleConnect)
  }, [socket])
  return seq
}

// 판에 있는 동안 지금 연결이 끊기면 판 정리 (다른 소켓·다른 판이면 무시)
export function useSelfDisconnect(socket, gameId, navigate) {
  useEffect(() => {
    if (!socket || !gameId) return
    const handleSelfDisconnect = createSelfDisconnectHandler({
      getActiveSocket: getSocket,
      registeredSocket: socket,
      registeredGameId: gameId,
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize: buildFinalizer(navigate),
    })
    return onDisconnect(socket, handleSelfDisconnect)
  }, [socket, gameId, navigate])
}
