// 인게임 스토어 손잡이를 나중에 묶어 두는 곳
// 입구가 create 뒤에 묶고 범위·밤 성공 기록 파일이 읽음 (입구와 import 고리 막기)
let api = null

// create 직후 한 번 묶음
export function bindStore(store) {
  api = store
}

// 묶인 스토어 돌려줌 (묶기 전에는 null)
export function getStore() {
  return api
}
