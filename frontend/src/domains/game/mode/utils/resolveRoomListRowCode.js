import { isValidRoomCode, normalizeRoomCode } from "../../shared/utils/roomCode.js"

export const ROOM_LIST_ROW_CODE_REQUIRED_LABEL = "코드"

export const ROOM_LIST_ROW_CODE_REQUIRED_ARIA = "코드 필요"

export function resolveRoomListRowCode(room) {
  if (room?.accessType !== "code") {
    return { visible: false, value: "", label: "", ariaText: "" }
  }

  const value = normalizeRoomCode(room?.code)

  if (!isValidRoomCode(value)) {
    return {
      visible: true,
      value: "",
      label: ROOM_LIST_ROW_CODE_REQUIRED_LABEL,
      ariaText: ROOM_LIST_ROW_CODE_REQUIRED_ARIA,
    }
  }

  return { visible: true, value, label: value, ariaText: `코드 ${value}` }
}
