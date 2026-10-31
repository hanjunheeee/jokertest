export const GAME_START_BLOCKED_TITLE = '게임을 시작할 수 없습니다'

export const GAME_START_BLOCKED_TITLE_CLASS =
  'font-subheading app-text-scaled [--app-text-size:clamp(1rem,2.4vw,1.35rem)] font-bold leading-snug text-[#3a1a0c]'

export const GAME_START_BLOCKED_MESSAGE_CLASS =
  'font-subheading app-text-scaled [--app-text-size:clamp(0.88rem,1.85vw,1.05rem)] font-semibold leading-relaxed text-[#3a1a0c]/90'

export const GAME_START_MESSAGES = Object.freeze({
  SOCKET_UNAVAILABLE: '서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
  ROOM_SYNC_PENDING: '현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.',
  REQUEST_TIMEOUT: '게임 시작 요청이 응답하지 않습니다. 잠시 후 다시 시도해주세요.',
  FALLBACK: '게임을 시작할 수 없습니다.',
})
