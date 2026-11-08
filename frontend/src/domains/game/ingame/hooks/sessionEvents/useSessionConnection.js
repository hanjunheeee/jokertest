// 판 진행 연결 감시 훅: 다시 연결 횟수 세기
// 판 진행 이벤트 훅(useGameSessionSocketEvents)이 부름
// 끊김 때는 판 정리 안 함 (서버가 끊김 유예 중이라 다시 붙은 뒤 스냅샷 다시 묶기로 판에 돌아감)
import { useEffect, useState } from "react"
import { noteConnectionRebound } from "../../store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "../../store/inGameEmojiBubble.store.js"
import { onConnect } from "../../socket/connection.js"

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
