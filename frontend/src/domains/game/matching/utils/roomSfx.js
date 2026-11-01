// 대기방 효과음 이벤트 만들기 (보내지는 않음)
// hooks/room이 만든 값을 dispatchSfxEvent로 보냄

// 로그인한 계정만 효과음 받음
const sfxAccount = ({ user, isLoggedIn }) => (isLoggedIn && user?.uuid ? user.uuid : null)

// 서버가 실어 준 방 효과음 정보로 이벤트 만들기, 못 만들면 null
export function roomSfx(kind, sfxEvent, auth) {
  if (sfxEvent === null || typeof sfxEvent !== 'object') return null
  const accountId = sfxAccount(auth)
  if (accountId === null) return null
  return {
    kind,
    eventId: sfxEvent.eventId,
    accountId,
    roomId: sfxEvent.roomId,
    origin: sfxEvent.origin,
  }
}

// 게임 시작 효과음 이벤트: 판 id로 이벤트 id 만듦 (같은 판 시작은 한 번만 울리기)
export function startSfx(gameId, payload, auth) {
  const accountId = sfxAccount(auth)
  if (typeof gameId !== 'string' || gameId.length === 0 || accountId === null) return null
  return {
    kind: 'game-started',
    eventId: `game:${gameId}:started`,
    accountId,
    gameId,
    origin: payload?.sfxEvent?.origin ?? payload?.origin ?? 'live',
  }
}
