// 인게임 스토어 상태 모양과 처음 값, 상태 고르개
// 입구 파일이 create 할 때 펼쳐 쓰고, 고르개는 입구가 다시 내보냄

// 판 id·판 상태·오류 + 아래 보조 값들
export const initialState = {
  gameId: null,
  state: null,
  error: null,

  // 방장 id (서버 상태 값을 먼저 씀)
  hostUuid: null,

  // 스냅샷을 반영할 때마다 1씩 올림
  snapshotSeq: 0,

  // 밤 개인 결과 (조사 결과 등)
  nightPrivateResult: null,

  // 낮 시작 연출 (밤 결과를 실시간으로 받았을 때만, 새로고침하면 다시 안 틂)
  dawnReport: null,
}

// 화면·훅이 useInGameStore(고르개)로 씀
export const selectInGameState = (store) => store.state

export const selectDawnReport = (store) => store.dawnReport
