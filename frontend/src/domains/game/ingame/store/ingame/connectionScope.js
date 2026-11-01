// 연결 범위: 공용 소켓이 바뀌거나 다시 연결되면 연결 세대를 올림
// 입구가 구독 시작, 수신·종료 결과 범위가 읽고, 연결 감시 훅이 다시 연결 알림
import { getSocket, subscribeSocket } from "../../../../../shared/socket/socketClient.js"
import { cancelRecords } from "./nightSuccessRecords.js"

// 마지막으로 본 소켓과 연결 세대 (처음엔 본 소켓 없음 표시)
const NONE = Symbol("no-socket-observed")
let epoch = 0
let seen = NONE

// 소켓 객체가 바뀌었으면 세대 올리고 옛 연결의 밤 성공 기록을 버림
function rebind() {
  const next = getSocket() ?? null
  if (seen === next) return
  seen = next
  epoch += 1
  cancelRecords()
}

// 공용 소켓 바뀜 구독 시작 (입구 파일이 스토어 만들기 전에 한 번 부름)
export function watchConnection() {
  subscribeSocket(rebind)
  rebind()
}

// 지금 연결 세대
export const getSocketEpoch = () => epoch

// 같은 소켓 객체가 다시 연결돼도 세대를 올림 (connect 받은 훅이 부름)
export function noteConnectionRebound() {
  epoch += 1
  cancelRecords()
}
