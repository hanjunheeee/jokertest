// 옛 경로 입구: 본체는 domains/game/shared/utils/roomCode.js로 옮김 (여러 영역이 같이 써서)
// 시험과 RoomCodeViewModal.jsx(원격 원문과 비교하는 시험 대상이라 손대지 않음)이 옛 경로로 부름
export {
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  normalizeRoomCode,
  isValidRoomCode,
  normalizeRoomCodeChar,
  normalizeRoomCodeText,
  resolveRoomCodeCopy,
  resolveRoomCodeCopyStatus,
} from "../../shared/utils/roomCode.js"
