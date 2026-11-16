// 대기방 알림 문구·추방 단추 잠긴 까닭 글
// hooks/room·useMatchingPage의 확인 창·alert, useMatchingRoomKick이 씀
import { INGAME_KICK_PLAYER_MODAL_COPY } from '../../ingame/constants/controls/kickPlayer/ingameKickPlayerData.js'

export const ROOM_MESSAGES = Object.freeze({
  CHECK_RETRY: '방 상태를 확인하지 못했습니다. 다시 확인하시겠습니까?',
  CHECKING: '현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.',
  SETTINGS_CHANGED: '방 설정이 변경되었습니다. 최신 설정을 확인해주세요.',
  READY_FAILED: '준비 상태를 변경하지 못했습니다.',
  READY_RETRY: '준비 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.',
  DELETE_FAILED: '방을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.',
  DELETE_CONFIRM: '방을 삭제하면 모든 참가자가 나가게 됩니다. 삭제하시겠습니까?',
})

// 방장의 추방 단추가 잠긴 까닭 글, 방 확인 상태마다 따로 (끊긴 창에 "확인하는 중"이 뜨면 사실과 달라서)
// 예: 같은 계정 새 창에 밀려 끊긴 옛 창 → waiting_socket 글
export const KICK_LOCKED_REASONS = Object.freeze({
  waiting_socket: '서버와 연결되어 있지 않아 추방할 수 없습니다.',
  checking: INGAME_KICK_PLAYER_MODAL_COPY.lockedReason,
  failed: '방 정보를 확인하지 못해 추방할 수 없습니다.',
})
