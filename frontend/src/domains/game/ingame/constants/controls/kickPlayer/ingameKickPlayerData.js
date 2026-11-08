// 추방 창 글: 제목·안내·버튼 이름·화면 읽기 이름·빈 목록 글
// 추방 창 틀·내용·줄과 시험이 사용

export const INGAME_KICK_PLAYER_MODAL_COPY = {
  title: "플레이어 추방",
  subtitle: "추방할 플레이어를 선택하세요.",
  notice: "추방을 확인하면 대상은 즉시 퇴장합니다. 진행 중인 게임에서는 스스로 나간 것과 동일하게 처리됩니다.",
  kickActionLabel: "추방",
  pendingLabel: "확인 중",
  pendingAriaLabel: "추방 확인 중",
  closeAriaLabel: "플레이어 추방 닫기",
  listAriaLabel: "추방 대상 플레이어 목록",
  emptyTargets: "추방할 수 있는 참가자가 없습니다.",
}

// 추방 실패 코드별 안내 (코드를 그대로 보이지 않기)
const KICK_ERROR_MESSAGES = Object.freeze({
  NOT_CONNECTED: "서버와 연결되어 있지 않습니다. 잠시 후 다시 시도해주세요.",
  NOT_READY: "아직 추방할 수 없습니다. 잠시 후 다시 시도해주세요.",
  NO_RESPONSE: "서버 응답이 없습니다. 결과를 확인한 뒤 다시 시도해주세요.",
  VERIFY_FAILED: "참가자 목록을 다시 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
  ALREADY_LEFT: "이미 게임을 떠난 플레이어입니다.",
  ENDED: "이미 끝난 게임입니다.",
  NOT_HOST: "방장만 추방할 수 있습니다.",
})

export const KICK_ERROR_FALLBACK_MESSAGE = "추방하지 못했습니다. 다시 시도해주세요."

// 실패 코드 → 안내 글 (모르는 코드는 공통 안내)
export function resolveKickErrorMessage(code) {
  return (typeof code === "string" && KICK_ERROR_MESSAGES[code]) || KICK_ERROR_FALLBACK_MESSAGE
}
