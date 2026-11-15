// 결과 화면에서 같은 방(대기방)으로 돌아가기 보내기·끝난 판 상태 묻기
// hooks/useGameResultReturnToMatching이 씀 (지금 내 방 묻기는 game/shared/socket/room.js)
import {
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_TIMEOUT_MS,
} from "@/domains/game/shared/constants/gameSetupSocket.js"

// 같은 방으로 돌아가기 (답에 방 내용, 거절이면 { ok: false, code, message }), 방 넣기라 방 만들기와 같은 시간 기다림
// 시간 안에 답이 없으면 undefined로 끝냄, 그 뒤 늦게 온 답은 onLateAnswer로 넘김 (서버가 방에 넣었는데 화면이 모르는 것 막기)
export function returnToRoom(socket, gameId, onLateAnswer = null) {
  return new Promise((resolve) => {
    let settled = false
    const timerId = setTimeout(() => {
      settled = true
      resolve(undefined)
    }, CREATE_ROOM_TIMEOUT_MS)
    socket.emit("return_to_room", { gameId }, (response) => {
      if (!settled) {
        settled = true
        clearTimeout(timerId)
        resolve(response)
        return
      }
      if (typeof onLateAnswer === "function") onLateAnswer(response)
    })
  })
}

// 끝난 판 상태 묻기 (결과 화면 닫힘 시각을 모를 때, 판 id 모르면 빈 요청으로 내 판 찾기)
export const askSnapshot = (socket, gameId = null) =>
  socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck("get_session_snapshot", gameId ? { gameId } : {})
