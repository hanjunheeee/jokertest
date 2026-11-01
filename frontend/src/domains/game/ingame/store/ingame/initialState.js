// 인게임 스토어 상태 모양과 처음 값, 상태 고르개
// 입구 파일이 create 할 때 펼쳐 쓰고 고르개는 다시 내보냄 (키 목록은 시험이 잠그므로 늘리거나 줄이지 않음)
import { EMPTY_NIGHT_SUCCESS_QUEUE } from "../../constants/store/ingameStore.js"

export const initialState = {
  gameId: null,
  state: null,
  error: null,

  // 방장 id (서버 상태 값을 먼저 씀)
  hostUuid: null,

  // 스냅샷을 반영할 때마다 1씩 올림
  snapshotSeq: 0,

  // 스냅샷이 들고 온 밤 결과의 주인 범위
  snapshotResultOwner: null,

  // 아직 안 본 밤 성공 연출
  nightSuccessQueue: EMPTY_NIGHT_SUCCESS_QUEUE,

  // 다른 사람 연출을 기다리는 중인지 (판·밤·수신 범위)
  nightPresentationWait: null,

  // 밤 개인 결과 (조사 결과 등)
  nightPrivateResult: null,
}

// 화면·훅이 useInGameStore(고르개)로 씀
export const selectInGameState = (store) => store.state

export const selectNightSuccessQueue = (store) => store.nightSuccessQueue

export const selectNightPresentationWait = (store) => store.nightPresentationWait
