/**
 * 인게임 나가기 확인 대화상자와 leave 요청을 묶는 컨트롤러를 만든다. 나가기 버튼 클릭과
 * 뒤로가기(POP) 가로채기가 이 함수 하나를 공유해, 확인 취소 시 아무 이벤트도 보내지 않는
 * 계약을 두 진입점에서 동일하게 지킨다.
 *
 * confirm()이 false를 반환하면(취소) requestLeave를 아예 호출하지 않고 false를 반환한다 —
 * 화면에 남고 leave_game_session도 전송되지 않는다. confirm()이 true면 requestLeave를
 * 호출하고 true를 반환한다(요청 결과 자체는 requestLeave/finalize의 몫이며, 이 함수는
 * "확인했는지"만 판단한다).
 */
export function createExitConfirmController({ confirm, requestLeave, message = "게임에서 나가시겠습니까?" }) {
  return () => {
    if (!confirm(message)) return false
    requestLeave()
    return true
  }
}
