// 다음 게임 설정 localStorage 읽기·쓰기·지우기 (쓴 뒤 다시 읽어 확인)
// store/nextRoomSettings 액션들이 씀, 저장소를 못 쓰는 브라우저면 실패로 돌려줌

// 저장소 꺼내기 (접근만 해도 오류 나는 환경이 있음)
export function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// 쓰고 다시 읽어서 같은지까지 봄
export function writeVerified(key, record) {
  const storage = getStorage()
  if (storage === null) return false
  try {
    storage.setItem(key, JSON.stringify(record))
  } catch {
    return false
  }
  try {
    return storage.getItem(key) === JSON.stringify(record)
  } catch {
    return false
  }
}

// 지우고 정말 없어졌는지까지 봄
export function removeVerified(key) {
  const storage = getStorage()
  if (storage === null) return false
  try {
    storage.removeItem(key)
  } catch {
    return false
  }
  try {
    return storage.getItem(key) === null
  } catch {
    return false
  }
}
