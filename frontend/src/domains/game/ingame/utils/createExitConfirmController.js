export function createExitConfirmController({ confirm, requestLeave, onDecision, message = "게임에서 나가시겠습니까?" }) {
  const announce = (kind) => {
    try {
      onDecision?.(kind)
    } catch {
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
