/**
 * react-router-dom useBlocker에 그대로 넘기는 차단 predicate. POP(브라우저/라우터
 * 뒤로가기·앞으로가기) 이탈만 가로채고, PUSH/REPLACE(성공 ack·game_ended에 따른 로비 이동
 * 포함)는 절대 막지 않는다 — finalize가 수행하는 navigate("/multiplay", {replace:true})가
 * 이 predicate를 통과해 차단되는 일이 없어야 하기 때문이다.
 */
export function isPopNavigationBlocked({ historyAction }) {
  return historyAction === "POP"
}
