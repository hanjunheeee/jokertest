/**
 * socket 인스턴스 하나에 안정적인 문자열 id를 붙인다.
 *
 * socketClient는 socket "참조"만 노출하고 세대 번호를 따로 주지 않는다(shared/socket/
 * socketClient.js 참고). 진입 연출의 scope 문자열에는 그 참조를 그대로 넣을 수 없으므로,
 * 참조당 한 번만 발급되는 증가 id를 WeakMap으로 기억해 문자열 키로 바꾼다.
 *
 * 같은 socket이면 몇 번을 물어도 같은 id다(렌더마다 scope가 흔들리지 않는다). socket이
 * 교체되면 새 id가 나오고, 그 사실만으로 이전 세대의 대기·표시 상태가 무효가 된다.
 * WeakMap이라 버려진 socket은 그대로 회수된다.
 */

const socketEpochIds = new WeakMap()
let nextSocketEpochId = 0

export function getInGameSocketEpochId(socket) {
  // WeakMap 키가 될 수 없는 값(null·undefined·원시값)은 전부 "소켓 없음"과 같게 다룬다.
  if (socket === null || (typeof socket !== "object" && typeof socket !== "function")) return "no-socket"
  const existing = socketEpochIds.get(socket)
  if (existing !== undefined) return existing
  nextSocketEpochId += 1
  const assigned = `socket-${nextSocketEpochId}`
  socketEpochIds.set(socket, assigned)
  return assigned
}
