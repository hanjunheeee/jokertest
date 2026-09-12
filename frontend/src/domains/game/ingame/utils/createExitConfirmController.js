/**
 * 인게임 나가기 확인 대화상자와 leave 요청을 묶는 컨트롤러를 만든다. 나가기 버튼 클릭과
 * 뒤로가기(POP) 가로채기가 이 함수 하나를 공유해, 확인 취소 시 아무 이벤트도 보내지 않는
 * 계약을 두 진입점에서 동일하게 지킨다.
 *
 * confirm()이 false를 반환하면(취소) requestLeave를 아예 호출하지 않고 false를 반환한다 —
 * 화면에 남고 leave_game_session도 전송되지 않는다. confirm()이 true면 requestLeave를
 * 호출하고 true를 반환한다(요청 결과 자체는 requestLeave/finalize의 몫이며, 이 함수는
 * "확인했는지"만 판단한다).
 *
 * F-16(AC-01): 확인/취소음의 단일 소유자는 이 confirm() **반환 경계**다. 나가기 버튼 클릭과
 * POP 가로채기 두 진입점이 이 함수 하나를 공유하므로, 여기에 한 번만 달면 두 진입점 모두
 * 정확히 한 번씩 울린다(trigger 버튼 쪽에는 표식을 달지 않는다 — 그러면 클릭 1 + 확인 1로
 * 두 번 울린다). onDecision은 주입이라 시험이 호출 횟수를 그대로 셀 수 있고, 던져도 기존
 * 취소=leave 0 / 승인=leave 1 계약을 바꾸지 않는다(AC-06).
 */
export function createExitConfirmController({ confirm, requestLeave, onDecision, message = "게임에서 나가시겠습니까?" }) {
  const announce = (kind) => {
    try {
      onDecision?.(kind)
    } catch {
      // 소리는 나가기 판단의 선행 조건이 아니다.
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
