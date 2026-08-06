/**
 * 설정 화면의 checks/ranges/역할 구성 상태를 create_room 요청 payload로 변환합니다.
 * React/Socket/Zustand에 의존하지 않는 순수 함수입니다.
 * @param {{
 *   checks: Record<string, boolean>,
 *   ranges: Record<string, number>,
 *   roleComposition?: {mode: string, roleCounts: Record<string, number>}
 * }} state - roleComposition이 없으면 AUTO로 본다(기존 호출부 호환).
 * @returns {object} create_room emit에 실릴 payload
 */
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"

export function buildCreateRoomPayload({ checks, ranges, roleComposition }) {
  const mode =
    roleComposition?.mode === ROLE_COMPOSITION_MODES.CUSTOM
      ? ROLE_COMPOSITION_MODES.CUSTOM
      : ROLE_COMPOSITION_MODES.AUTO

  const payload = {
    // "코드로만 참가" 체크 여부를 accessType으로 변환한다. 체크 시 "코드를 아는 사람만
    // 참가 가능"이라는 의미라 "code"로, 아니면 "open"으로 매핑한다.
    accessType: checks["private-lobby"] ? "code" : "open",
    maxPlayers: ranges["max-players"],
    jokerCount: ranges["joker-count"],
    lightsOut: checks["lights-out"],
    soulBetting: checks["soul-betting"],
    dayDiscussionTime: ranges["day-discussion-time"],
    dayVoteTime: ranges["day-vote-time"],
    nightActionTime: ranges["night-action-time"],
    voteReveal: checks["vote-reveal"],
    roleCompositionMode: mode,
  }

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    // AUTO에서는 roleCounts를 아예 만들지 않는다 — CUSTOM으로 갔다가 되돌아온 경우에도
    // 이전 입력이 payload에 남지 않게 하기 위한 계약이다(서버도 AUTO+roleCounts를 거부한다).
    return payload
  }

  // 허용된 4개 키만 순서까지 고정해 새로 만든다. 상태에 다른 키(CITIZEN 등)가 섞여 있어도
  // payload로 새어 나가지 않는다. 값 자체는 보정하지 않고 그대로 싣는다 — 잘못된 값은
  // 서버가 거부해야 하며, 여기서 조용히 고치면 사용자가 지정한 값과 달라진다.
  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) roleCounts[key] = roleComposition.roleCounts?.[key]

  return {
    ...payload,
    // CUSTOM에서는 roleCounts.JOKER가 canonical이다. 서버는 두 값이 다르면 거부하므로
    // jokerCount도 반드시 같은 값으로 맞춰 보낸다.
    jokerCount: roleCounts.JOKER,
    roleCounts,
  }
}
