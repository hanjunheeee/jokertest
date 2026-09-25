import { INGAME_PLAYER_THEME_PALETTE_SIZE } from "../constants/ingamePlayerTheme.js"

// game-core/gameSession.js의 ROLE_TEAMS와 값이 일치해야 한다 — 이 프로젝트에는 백엔드/프런트가
// 공유하는 상수 모듈이 없어 수동으로 동기화한다(둘 중 하나가 바뀌면 같이 바꿔야 함). role과
// team을 각각 독립적으로 화이트리스트 검사하면 {role:"JOKER", team:"CITIZEN"} 같이 각각은
// 허용되지만 정책상 불가능한 조합이 통과할 수 있다 — role이 곧 team을 결정하는 이 맵 하나로
// role 존재 여부와 role/team 조합 정합성을 함께 검증한다.
const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}
const EMPTY_RESULT = Object.freeze({ sourcePlayers: null, localPlayerId: null })

/**
 * 서버 game_started state를 InGamePlayerSessionProvider가 기대하는 sourcePlayers/localPlayerId
 * 형태로 변환합니다. 이 함수의 책임은 플레이어 세션 변환이므로, state.players 각 항목의
 * uuid/nickname/alive/themeIndex와 state.self의 uuid/role/team/allies만 엄격히 검증합니다
 * (state.id/phase/dayIndex, self.nickname 등 이 함수가 쓰지 않는 필드는 검증 대상이 아닙니다)
 * — 검증 대상 필드 중 하나라도 어긋나면 부분 목록 대신 안전한 preview fallback을 돌려줍니다.
 *
 * themeIndex는 표시 색상 배정으로, 서버가 게임당 한 번 배정해 모든 참가자에게 같은 값을
 * 내려줍니다(클라이언트가 각자 추첨하면 같은 참가자가 화면마다 다른 색으로 보입니다).
 * role/team과 달리 모든 참가자에게 공통으로 존재하는 필드이므로 조건부가 아니라 항상
 * 검증·전달합니다.
 * @param {object} state - game_started payload의 state(신뢰하지 않는 외부 입력)
 * @flow players 전수 검증 → self 검증 → JOKER면 allies 검증 → sourcePlayers 조립
 */
export function buildPlayerSessionSourceFromGameState(state) {
  if (!state || !Array.isArray(state.players)) return EMPTY_RESULT

  const seenUuids = new Set()
  for (const player of state.players) {
    if (!player || typeof player !== "object") return EMPTY_RESULT
    if (typeof player.uuid !== "string" || player.uuid.length === 0) return EMPTY_RESULT
    if (typeof player.nickname !== "string" || player.nickname.trim().length === 0) return EMPTY_RESULT
    if (typeof player.alive !== "boolean") return EMPTY_RESULT
    if (!Number.isInteger(player.themeIndex)) return EMPTY_RESULT
    if (player.themeIndex < 0 || player.themeIndex >= INGAME_PLAYER_THEME_PALETTE_SIZE) return EMPTY_RESULT
    if (seenUuids.has(player.uuid)) return EMPTY_RESULT
    seenUuids.add(player.uuid)
  }

  const self = state.self
  if (!self || typeof self !== "object") return EMPTY_RESULT
  if (typeof self.uuid !== "string" || !seenUuids.has(self.uuid)) return EMPTY_RESULT
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return EMPTY_RESULT
  if (self.team !== ROLE_TEAMS[self.role]) return EMPTY_RESULT

  // allies는 JOKER 전용 own-property 계약이다: JOKER는 반드시 있어야 하고(생략 불가), 배열이며
  // 자기 자신/미지 uuid/중복 없이 다른 참가자 uuid만 담아야 한다. 비-JOKER는 키 자체가 없어야
  // 한다 — 서버를 신뢰하지 않고(위 role/team 검증과 동일한 철학) 여기서 다시 검증한다.
  if (self.role === "JOKER") {
    if (!Object.hasOwn(self, "allies")) return EMPTY_RESULT
    if (!Array.isArray(self.allies)) return EMPTY_RESULT
    const seenAllies = new Set()
    for (const allyUuid of self.allies) {
      if (typeof allyUuid !== "string" || allyUuid.length === 0) return EMPTY_RESULT
      if (allyUuid === self.uuid) return EMPTY_RESULT
      if (!seenUuids.has(allyUuid)) return EMPTY_RESULT
      if (seenAllies.has(allyUuid)) return EMPTY_RESULT
      seenAllies.add(allyUuid)
    }
  } else if (Object.hasOwn(self, "allies")) {
    return EMPTY_RESULT
  }

  const allyIds = self.role === "JOKER" ? new Set(self.allies) : null

  const sourcePlayers = state.players.map((player) => {
    const entry = {
      id: player.uuid,
      name: player.nickname,
      connected: typeof player.isConnected === "boolean" ? player.isConnected : true,
      alive: player.alive,
      themeIndex: player.themeIndex,
    }
    // 본인 항목에만 role/team을 연결한다. 다른 참가자 항목에는 role/team 키 자체를 만들지
    // 않는다(UNKNOWN 같은 가짜 값도 채우지 않음) — 비밀 유지.
    if (player.uuid === self.uuid) {
      entry.role = self.role
      entry.team = self.team
    } else if (allyIds?.has(player.uuid)) {
      // 동료 JOKER 항목에만 isAlly를 붙인다 — role/team과 마찬가지로 해당 없는 항목에는
      // 키 자체가 생기지 않는다.
      entry.isAlly = true
    }
    // F-13(AC-05): 계정 프로필 사진·테두리는 role과 달리 비밀이 아니라 모든 참가자에게
    // 공개되는 식별자다(buildGameStartedPayload/buildSessionSnapshot의 공용 players[]가
    // 이미 전원에게 같은 방식으로 내려준다). mergeSourcePlayerWithPreview가 이 두 필드를
    // own-property일 때만 조건부로 쓰므로, 여기서 전달하지 않으면 서버가 보낸 값이 있어도
    // 최종 초상에 반영되지 않는다 — role/isAlly와 같은 조건부 복사 관례를 따른다.
    if (Object.hasOwn(player, "accountProfilePhotoId")) {
      entry.accountProfilePhotoId = player.accountProfilePhotoId
    }
    if (Object.hasOwn(player, "accountProfileBorderId")) {
      entry.accountProfileBorderId = player.accountProfileBorderId
    }
    // F-14(AC-01/AC-04): 장착한 플레이어 카드 프레임도 계정 프로필 사진·테두리와 같은
    // 공개 필드다(buildGameStartedPayload/buildSessionSnapshot의 공용 players[]가 이미
    // 전원에게 같은 방식으로 내려준다) — mergeSourcePlayerWithPreview.js가 own-property일
    // 때만 조건부로 쓰므로 여기서 전달하지 않으면 서버가 보낸 값이 있어도 보드에 반영되지
    // 않는다.
    if (Object.hasOwn(player, "accountCardFrameId")) {
      entry.accountCardFrameId = player.accountCardFrameId
    }
    // CO S-1(AC-05): 계정 전적(총 판수·승률)도 프로필 자산과 같은 공개 필드이고, 같은
    // own-property 조건부 복사 관례를 따른다 — 여기서 전달하지 않으면 서버가 보낸 전적이
    // 세션 원본에서 끊겨 전적 목록이 전원 "조회 실패"로 보인다. 서버가 실제로 조회하지
    // 못한 참가자는 키 자체가 없으므로 0판 0%로 채우지 않는다.
    if (Object.hasOwn(player, "accountTotalGames")) {
      entry.accountTotalGames = player.accountTotalGames
    }
    if (Object.hasOwn(player, "accountWinRate")) {
      entry.accountWinRate = player.accountWinRate
    }
    return entry
  })

  return { sourcePlayers, localPlayerId: self.uuid }
}
