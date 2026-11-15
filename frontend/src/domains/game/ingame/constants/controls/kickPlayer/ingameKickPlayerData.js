// 추방 창 글: 제목·안내·버튼 이름·화면 읽기 이름·빈 목록 글·결과 글·실패 까닭 글
// 추방 창 틀·내용·줄·방장 추방 단추(PC·모바일)와 시험이 사용

export const INGAME_KICK_PLAYER_MODAL_COPY = {
  title: "플레이어 추방",
  subtitle: "추방할 플레이어를 선택하세요.",
  notice: "추방을 누르면 확인 없이 바로 내보냅니다.",
  kickActionLabel: "추방",
  pendingLabel: "보내는 중",
  pendingAriaLabel: "추방 보내는 중",
  closeAriaLabel: "플레이어 추방 닫기",
  listAriaLabel: "추방 대상 플레이어 목록",
  emptyTargets: "추방할 수 있는 참가자가 없습니다.",
  unknownResult: "결과를 확인할 수 없습니다. 결과 확인을 누르거나 목록을 다시 확인한 뒤 새로 시도해주세요.",
  lookupResultLabel: "결과 확인",
  lockedReason: "방 정보를 서버에서 확인하는 중이라 아직 추방할 수 없습니다.",
  awaitingResolution: "현재 참가자 목록을 서버에서 다시 확인하는 중입니다. 확인이 끝나야 새로 추방할 수 있습니다.",
}

// 추방 실패 코드별 안내 (코드를 그대로 보이지 않기)
// 화면이 만든 코드 + 서버 거절 코드(backend/socket/kickReceiptStore/constants.js) 전부
const KICK_ERROR_MESSAGES = Object.freeze({
  NOT_CONNECTED: "서버와 연결되어 있지 않습니다. 잠시 후 다시 시도해주세요.",
  NOT_READY: "방 정보가 아직 다 오지 않았습니다. 잠시 후 다시 시도해주세요.",
  NO_RESPONSE: "서버 응답이 없습니다. 결과를 확인한 뒤 다시 시도해주세요.",
  VERIFY_FAILED: "참가자 목록을 다시 확인하지 못했습니다. 결과 확인을 다시 눌러주세요.",
  ALREADY_LEFT: "이미 방에서 나간 참가자입니다.",
  NOT_HOST: "방장만 추방할 수 있습니다.",
  STALE_MEMBERSHIP: "참가자 목록이 바뀌었습니다. 목록을 확인한 뒤 다시 눌러주세요.",
  ADMISSION_PENDING: "입장 처리가 아직 끝나지 않았습니다. 잠시 후 다시 시도해주세요.",
  ROOM_NOT_FOUND: "방 정보가 바뀌었습니다. 창을 닫았다가 다시 열어주세요.",
  NOT_IN_ROOM: "지금 방에 들어와 있지 않습니다. 방 목록에서 다시 들어와주세요.",
  STALE_SOCKET: "연결이 바뀌었습니다. 잠시 후 다시 시도해주세요.",
  STALE_BOOT: "서버가 다시 시작되었습니다. 방 정보를 다시 불러온 뒤 시도해주세요.",
  RECEIPT_CAPACITY: "추방 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  REQUEST_ID_REUSED: "같은 요청이 이미 처리되었습니다. 목록을 확인해주세요.",
  SELF_KICK: "자기 자신은 추방할 수 없습니다.",
  ALREADY_IN_GAME: "게임이 이미 시작되어 추방할 수 없습니다.",
  INVALID_REQUEST: "요청 내용이 맞지 않습니다. 창을 닫았다가 다시 열어주세요.",
  INTERNAL_ERROR: "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해주세요.",
})

export const KICK_ERROR_FALLBACK_MESSAGE = "추방하지 못했습니다. 다시 시도해주세요."

// 실패 코드 → 안내 글 (모르는 코드는 공통 안내)
export function resolveKickErrorMessage(code) {
  return (typeof code === "string" && KICK_ERROR_MESSAGES[code]) || KICK_ERROR_FALLBACK_MESSAGE
}
