import { selectInGameSelfAlive } from "./selectInGameSelfAlive.js"

/**
 * 현재 gameState가 JOKER 전용 NIGHT 채팅 자격을 갖췄는지 판정한다.
 *
 * 생존 여부는 요구하지 않는다 — 죽은 광대의 JOKER 채널 열람·전송은 확정 스펙상 광대만의
 * 특례다(다른 직업에는 해당 없음). 밤에 사망자의 DEAD 채널이 닫히는 것과 함께 보면, 죽은
 * 광대에게 밤에 열려 있는 유일한 채널이 JOKER다.
 *
 * 이 한 함수가 useInGameJokerChatSession의 리스너 등록·전송과 InGameChatShell의 화면 선택을
 * 동시에 지배하므로, 여기만 열면 열람·전송·표시가 함께 열린다.
 *
 * 알려진 불일치: 서버 prepareGameSession 계층(prepareJokerChatMessage·getChatRecipientUuids)은
 * 아직 사망한 JOKER를 NOT_ELIGIBLE로 막는다. 이 슬라이스의 백엔드 변경 범위가 game_started
 * payload 한 곳으로 제한돼 프런트만 먼저 여는 것이며, 그동안 죽은 광대는 입력창이 열리되
 * 전송은 서버 오류로 거부된다 — 서버 대응은 후속 슬라이스 몫이다.
 *
 * 생존 여부를 아직 알 수 없으면(roster에 self가 없는 등 — selectInGameSelfAlive가 null)
 * 자격을 주지 않는다(fail-closed).
 * @param {object} state - canonical 인게임 state
 */
export function isJokerNightChatEligible(state) {
  if (state?.phase !== "NIGHT") return false
  if (state?.self?.team !== "JOKER") return false
  return selectInGameSelfAlive(state) !== null
}
