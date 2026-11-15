// 게임 나가기 확인 흐름 만들기, 확인 창 글 고르기, 뒤로 가기 막기 판단
// 나가기 훅이 사용 (글은 판 중 산 사람·죽은 사람·결과 화면이 다름)

// 확인 창 글: 산 사람은 나가면 탈주라 벌을 미리 알림, 죽은 사람은 벌 없음, 결과 화면은 로비로 감
export const EXIT_CONFIRM_MESSAGES = Object.freeze({
  ALIVE: [
    "게임에서 나가시겠습니까?",
    "지금 나가면 패배로 기록되고 골드를 못 받습니다.",
    "나간 뒤 한동안 다른 방에 들어갈 수 없습니다 (오늘 1번째 5분, 2번째 30분, 3번째부터 1일).",
  ].join("\n"),
  DEAD: [
    "게임에서 나가시겠습니까?",
    "사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다.",
  ].join("\n"),
  PLAIN: "게임에서 나가시겠습니까?",
  RESULT: "로비로 나가시겠습니까?",
})

// 판 상태로 확인 창 글 고르기 (내 자리가 없거나 판이 끝났으면 탈주가 아니라 벌 글 없음)
// 예: 결과 화면 → RESULT, 판 중 alive:true → ALIVE, alive:false → DEAD
export function selectExitConfirmMessage({ onResultScreen = false, gameState = null, selfUuid = null } = {}) {
  if (onResultScreen) return EXIT_CONFIRM_MESSAGES.RESULT
  if (gameState === null || typeof gameState !== "object") return EXIT_CONFIRM_MESSAGES.PLAIN
  if (gameState.phase === "ENDED") return EXIT_CONFIRM_MESSAGES.PLAIN
  const uuid = selfUuid ?? gameState.self?.uuid ?? null
  if (typeof uuid !== "string" || uuid.length === 0) return EXIT_CONFIRM_MESSAGES.PLAIN
  const seated = (gameState.players ?? []).find((player) => player?.uuid === uuid)
  if (!seated || seated.isParticipating === false) return EXIT_CONFIRM_MESSAGES.PLAIN
  return seated.alive === false ? EXIT_CONFIRM_MESSAGES.DEAD : EXIT_CONFIRM_MESSAGES.ALIVE
}

// 나가기 상태별 안내 글 (판 중 사망 후 선택 창이 씀, PC·모바일 같은 글)
export function selectExitStatusNotice(exitStatus, exitErrorCode) {
  if (exitStatus === "pending") return "나가는 중입니다…"
  if (exitStatus === "failed") {
    if (exitErrorCode === "OFFLINE") return "연결이 끊겨 나가기를 보내지 못했습니다. 다시 시도해 주세요."
    if (exitErrorCode === "STILL_PARTICIPATING") return "아직 이 게임에 남아 있습니다. 다시 시도해 주세요."
    return "나가기에 실패했습니다. 다시 시도해 주세요."
  }
  if (exitStatus === "unresolved") {
    return "나가기 결과를 확인하지 못했습니다. 결과 확인 후 다시 시도할 수 있습니다."
  }
  return null
}

// 결과 화면 "로비로" 실패 안내 글 (결과 화면엔 다시 시도·결과 확인 단추가 없어 다시 누르라고 알림)
export function selectResultExitFailureNotice(exitStatus, exitErrorCode) {
  if (exitStatus === "failed") {
    if (exitErrorCode === "OFFLINE") return "연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요."
    return "로비로 가지 못했습니다. '로비로'를 다시 눌러 주세요."
  }
  if (exitStatus === "unresolved") {
    return "서버 답이 없어 로비로 갔는지 확인하지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요."
  }
  return null
}

// 확인 창 → 취소면 그대로, 확인이면 나가기 요청 (결과는 onDecision으로 알림)
export function createExitConfirmController({ confirm, requestLeave, onDecision, message = EXIT_CONFIRM_MESSAGES.PLAIN }) {
  // 취소·확인 결정을 바깥에 알림
  const announce = (kind) => {
    try {
      onDecision?.(kind)
    } catch {
      // 결정 알림 실패가 나가기 흐름을 막지 않게 무시함
    }
  }

  return () => {
    if (!confirm(message)) {
      announce("ui-cancel")
      return false
    }
    announce("ui-confirm")
    requestLeave()
    return true
  }
}

// 브라우저 뒤로 가기(POP)면 막음
export function isPopNavigationBlocked({ historyAction }) {
  return historyAction === "POP"
}
