// 대기방·매칭 장부 파일 (Map 12개)
// matchmaking 안 파일들만 사용, 밖은 matchmaking.js 함수로만 건드림

// 자동 매칭 줄 선 사람 (uuid → 줄 정보), 인원 차면 방 만들고 빠짐
const matchmakingQueue = new Map()

// 지금 열린 대기방 전부 (방 id → 방), 게임 시작하면 지움
const gameRooms = new Map()

// 누가 어느 대기방에 있나 (uuid → 방 id), gameRooms랑 같이 움직임
const playerRoom = new Map()

// 끝난 판 → 방장이 만든 다음 방 (우편함, 30분)
const partyMatchingRoomByGameId = new Map()

// 방 만들기·입장·매칭 중복 잠금 (uuid → 처리 중 토큰)
const pendingRoomTransitions = new Map()

// 초대 수락 중인 입장 시도 (자리 미리 잡음, 최대 15초)
const roomAdmissionAttempts = new Map()

// 명단엔 넣었지만 영수증 전인 시도 (되돌릴 권리)
const publishedAdmissions = new Map()

// 설정 저장 결과 영수증 (같은 요청 다시 오면 결과 재생, 10분)
const roomSettingsUpdateResults = new Map()

// 사람별 세대 번호, 게임 끝 정리 때 +1 (옛 요청 커밋 막기)
const roomTransitionGeneration = new Map()

// 시작돼 사라진 방 코드 기억 ("이미 시작" vs "방 없음" 구분, 30분)
const startedRoomMarks = new Map()

// 끊긴 사람 15초 뒤 방에서 빼기 예약
const pendingRoomRemovals = new Map()

// "방에 있음" 확인된 순번 (늦은 끊김이 확인을 못 뒤집게)
const roomPresenceConfirmedTick = new Map()

module.exports = {
    matchmakingQueue,
    gameRooms,
    playerRoom,
    partyMatchingRoomByGameId,
    pendingRoomTransitions,
    roomAdmissionAttempts,
    publishedAdmissions,
    roomSettingsUpdateResults,
    roomTransitionGeneration,
    startedRoomMarks,
    pendingRoomRemovals,
    roomPresenceConfirmedTick,
}
