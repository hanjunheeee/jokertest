import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"

/**
 * useInGamePlayerSessionContext()가 주는 players(및 localPlayerId)를 InGameTargetPicker가
 * 기대하는 {id, name, alive, connected, selectable} 형태로 변환합니다.
 *
 * role/team 등 비밀 필드는 입력 player 객체에 있더라도(본인 항목에는 role/team이 붙어
 * 있음) 절대 복사하지 않습니다 — id/name/alive/connected/selectable 다섯 키만 새로 만들어
 * 반환하므로, 자기 자신이든 다른 참가자든 예외 없이 role/team이 결과에 나타나지 않습니다.
 * 동료 JOKER 항목(isAlly:true)은 목록에서 제거하지 않고 name에 "· 동료 JOKER" 접미사를
 * 붙인 채 selectable:false로 표시합니다(본인 제외는 별개로 filter가 처리 — 동료는 "보이되
 * 선택 불가", 본인은 "아예 안 보임").
 *
 * id는 원본 player.id를 그대로 씁니다 — buildPlayerSessionSourceFromGameState가
 * player.id = player.uuid로 만들었으므로, 이 함수의 출력 id도 서버가 아는 실제 uuid와
 * 항상 같습니다(제출 시 targetId로 그대로 쓸 수 있어야 함).
 *
 * 생존/사망을 기준으로 한 선택 가능 여부는 이 함수가 소유합니다 — InGameTargetPicker는
 * selectable/connected만 보고 잠그며 alive는 표시(상태 dot·"생존/사망" 라벨)에만 씁니다.
 *
 * @param {Array|null|undefined} players 세션 컨텍스트의 참가자 목록({id,nickname,status,isAlly})
 * @param {string} [localPlayerId] 나 자신의 uuid — selfTargetAllowed가 아니면 목록에서 제외한다
 * @param {boolean} [selfTargetAllowed] 자기 자신을 대상으로 지정할 수 있는가(DOCTOR)
 * @param {boolean} [deadTargetsOnly] 사망자만 지목할 수 있는가(WITCH_HUNTER). 생존자를 목록에서
 *   지우지 않고 선택만 잠근다 — 시신이 아직 없는 밤에 목록이 통째로 비어 "패널이 고장난 것처럼"
 *   보이지 않게 하기 위해서이며, 동료 JOKER를 "보이되 선택 불가"로 두는 관례와 같다.
 * @flow 본인을 필터링한 뒤 각 항목의 alive를 한 번 계산해 표시값(alive)과 선택 가능 여부
 *   (selectable)에 함께 씁니다. 동료 JOKER는 생존/사망과 무관하게 언제나 선택 불가입니다.
 */
export function buildNightActionTargets(
  players,
  { localPlayerId, selfTargetAllowed, deadTargetsOnly = false } = {},
) {
  if (!Array.isArray(players)) return []

  return players
    .filter((player) => selfTargetAllowed || player.id !== localPlayerId)
    .map((player) => {
      const alive = player.status !== INGAME_PLAYER_STATUS.DEAD
      return {
        id: player.id,
        name: player.isAlly ? `${player.nickname} · 동료 JOKER` : player.nickname,
        alive,
        connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
        selectable: !player.isAlly && (deadTargetsOnly ? !alive : alive),
      }
    })
}
