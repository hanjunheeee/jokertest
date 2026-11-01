// 게임 나가기 확인 흐름 만들기와 뒤로 가기 막기 판단
// 나가기 훅이 사용

// 확인 창 → 취소면 그대로, 확인이면 나가기 요청 (결과는 onDecision으로 알림)
export function createExitConfirmController({ confirm, requestLeave, onDecision, message = "게임에서 나가시겠습니까?" }) {
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
