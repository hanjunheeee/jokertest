// 대기방 알림 문구
// hooks/room·useMatchingPage의 확인 창·alert가 씀
export const ROOM_MESSAGES = Object.freeze({
  CHECK_RETRY: '방 상태를 확인하지 못했습니다. 다시 확인하시겠습니까?',
  CHECKING: '현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.',
  SETTINGS_CHANGED: '방 설정이 변경되었습니다. 최신 설정을 확인해주세요.',
  READY_FAILED: '준비 상태를 변경하지 못했습니다.',
  READY_RETRY: '준비 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.',
  PARTY_ROOM_GONE: '방장의 새 방에 들어갈 수 없습니다. 방 목록으로 이동합니다.',
  PARTY_WAIT_TIMEOUT: '방장의 새 방을 기다리는 시간이 지났습니다. 방 목록으로 이동합니다.',
  DELETE_FAILED: '방을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.',
  DELETE_CONFIRM: '방을 삭제하면 모든 참가자가 나가게 됩니다. 삭제하시겠습니까?',
})
