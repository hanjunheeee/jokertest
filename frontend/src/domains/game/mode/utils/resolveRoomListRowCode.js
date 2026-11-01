// 방 목록 줄의 코드 배지 값: 코드 방이면 코드(형식 안 맞으면 "코드"), 공개 방이면 안 보임
// RoomListRow가 씀, 시험도 씀
import { isValidRoomCode, normalizeRoomCode } from "../../shared/utils/roomCode.js"

// 코드 값을 모를 때 배지 글자·읽기 문구
export const REQUIRED_LABEL = "코드"

export const REQUIRED_ARIA = "코드 필요"

// 방 한 개의 코드 배지 값
export function resolveRoomListRowCode(room) {
  // 공개 방이면 배지 숨김
  if (room?.accessType !== "code") {
    return { visible: false, value: "", label: "", ariaText: "" }
  }

  const value = normalizeRoomCode(room?.code)

  // 코드가 형식에 안 맞으면 "코드"만 표시
  if (!isValidRoomCode(value)) {
    return {
      visible: true,
      value: "",
      label: REQUIRED_LABEL,
      ariaText: REQUIRED_ARIA,
    }
  }

  return { visible: true, value, label: value, ariaText: `코드 ${value}` }
}
