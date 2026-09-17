/**
 * leave_game_session 요청을 보내는 함수를 만든다. 나가기 버튼과 뒤로가기(POP) 가로채기가
 * 이 함수 하나를 공유해, 두 진입점에서 항상 같은 요청·ack 처리 규칙을 따르게 한다.
 *
 * gameId는 emit하는 그 시점에 getCurrentGameId()로 캡처해 payload에 담는다(서버가
 * canonical gameId를 ack에 담아 돌려주지 않으므로, ack 판별 기준을 직접 들고 있어야 한다).
 * ack가 도착했을 때 getCurrentGameId()를 다시 조회해 캡처해둔 gameId와 비교한다 — 그 사이
 * game_ended나 다른 경로로 이미 세션이 바뀌었다면(늦게 도착한 이전 요청의 ack) store를
 * 건드리지 않는다. 서버 ack가 { ok:false }여도, 그리고 그 사이 이미 세션이 바뀌어 있어도
 * finalize는 호출하지 않는다 — 오직 "지금 이 gameId에 대한" 성공 ack만 finalize를 트리거한다.
 *
 * F-21(AC-05): gameId만으로는 부족하다. 같은 gameId가 그대로여도 그 사이에 **계정이 바뀌거나**
 * (A→B→A) **연결이 교체되거나**(재로그인·재연결) **내 소속이 바뀔** 수 있다. 그때 도착한 옛
 * ack로 현재 화면을 끝내면, 지금 진행 중인 판이 남의 요청 결과로 정리된다. 그래서 요청을 보낸
 * 그 순간의 계정·소켓·소속을 함께 캡처하고, ack에서 넷을 모두 다시 확인한다.
 *
 * @param {object} deps
 * @param {() => object|null} deps.getSocket - 현재 연결. ack 시점에 다시 불러 교체를 확인한다.
 * @param {() => string|null} deps.getCurrentGameId - 현재 게임.
 * @param {() => string|null} [deps.getCurrentAccountId] - 현재 인증 계정.
 * @param {() => string|null} [deps.getCurrentMembershipId] - 그 게임에서의 내 소속 식별자.
 * @param {() => number|null} [deps.getIdentityGeneration] - 인증 전이 세대(로그인·로그아웃마다
 *   증가). **현재 값 비교만으로는 A→B→A를 구별할 수 없다** — 계정 uuid가 원래대로 돌아오고
 *   소속과 소켓 객체가 그대로면 네 검사가 전부 통과한다. 전이 횟수가 그 구간을 드러낸다.
 */
export function createLeaveGameSessionRequest({
  getSocket,
  getCurrentGameId,
  getCurrentAccountId = () => null,
  getCurrentMembershipId = () => null,
  getIdentityGeneration = () => null,
  finalize,
  onFailure,
}) {
  return () => {
    const socket = getSocket()
    if (!socket) return

    const requestedGameId = getCurrentGameId()
    if (!requestedGameId) return
    const requestedAccountId = getCurrentAccountId()
    const requestedMembershipId = getCurrentMembershipId()
    const requestedIdentityGeneration = getIdentityGeneration()
    // 같은 Socket 객체가 재연결되면 객체 동일성은 유지되고 **id만** 바뀐다 — 그 재연결 이전에
    // 보낸 요청의 ack는 지금 연결의 것이 아니다.
    const requestedSocketId = socket?.id ?? null

    socket.emit("leave_game_session", { gameId: requestedGameId }, (response) => {
      // 하나라도 달라졌으면 이 ack는 더 이상 "지금 이 화면"의 것이 아니다. 실패 안내도
      // 띄우지 않는다 — 그 실패는 이미 지나간 소속의 사실이다.
      if (getCurrentGameId() !== requestedGameId) return
      if (getCurrentAccountId() !== requestedAccountId) return
      if (getIdentityGeneration() !== requestedIdentityGeneration) return
      if (getSocket() !== socket) return
      if ((socket?.id ?? null) !== requestedSocketId) return
      if (getCurrentMembershipId() !== requestedMembershipId) return
      if (response?.ok) {
        finalize()
        return
      }
      onFailure?.(response)
    })
  }
}
