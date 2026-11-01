// 방 코드 입장 실패 안내 문구 (서버 실패 코드별)
// hooks/useRoomInvitePage가 씀
export const ROOM_JOIN_FAILURE_MESSAGES = {
  ROOM_CODE_MISMATCH: "입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.",
  ROOM_NOT_FOUND: "방을 찾을 수 없습니다. 이미 사라진 방일 수 있어요.",
  ROOM_ALREADY_STARTED: "이미 게임이 시작된 방이라 입장할 수 없습니다.",
  ROOM_FULL: "방 정원이 가득 찼습니다.",
  CODE_REQUIRED: "입장 코드를 입력해주세요.",
  SESSION_ENDED: "이미 끝난 게임의 방이라 입장할 수 없습니다. 새 방을 만들어주세요.",
  INVALID_REQUEST: "잘못된 참가 요청입니다. 방 코드로는 일반 참가만 할 수 있습니다.",
}
