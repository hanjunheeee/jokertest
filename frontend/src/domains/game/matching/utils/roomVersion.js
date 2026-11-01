// 방 이벤트·응답이 지금 방보다 옛것인지 새것인지 가르는 계산
// hooks/room이 씀, 상태는 부르는 쪽이 넘김

// 준비 이벤트 판정 결과: 반영 / 버림 / 더 새 설정이라 방 다시 확인
export const READY_EVENT = Object.freeze({ APPLY: 'apply', STALE: 'stale', NEWER: 'newer' })

// 준비 바뀜 이벤트 판정: 설정 버전 먼저 보고, 같으면 그 사람의 준비 순번 봄
export const classifyReady = (state, uuid, { settingsVersion, readyRevision }) => {
  // 설정 버전이 다르면 버전만으로 판정
  if (Number.isSafeInteger(settingsVersion)) {
    if (!Number.isSafeInteger(state.settingsVersion)) return READY_EVENT.NEWER
    if (settingsVersion > state.settingsVersion) {
      return READY_EVENT.NEWER
    }
    if (settingsVersion < state.settingsVersion) return READY_EVENT.STALE
  }
  // 이미 받은 순번 이하면 늦게 온 이벤트
  const player = state.players.find((p) => p.uuid === uuid)
  if (Number.isInteger(readyRevision) && Number.isInteger(player?.readyRevision)
    && readyRevision <= player.readyRevision) return READY_EVENT.STALE
  return READY_EVENT.APPLY
}

// 응답에 실린 방이 같은 방의 더 새 설정 버전인지 (state는 지금 대기방 상태)
export const isNewerRoom = (room, state) => {
  if (room === null || typeof room !== 'object') return false
  const { roomId, settingsVersion: known } = state
  if (room.roomId !== roomId) return false
  const incoming = room.settingsVersion
  if (!Number.isSafeInteger(incoming)) return false
  if (!Number.isSafeInteger(known)) return true
  return incoming > known
}
