// 게임 판 장부 3개 모아 둔 파일
// game-core 안 파일들만 require 해서 사용, socket 쪽은 gameSession.js 함수로만 건드림

// 판 id → 판 전체. 진행 중인 판이랑, 끝났는데 아직 다 안 나간 판도 존재
const gameSessions = new Map()

// 사람 uuid → 판 id. 한 사람이 판 두 개에 못 들어가 막기
const playerSession = new Map()

// 방 id → 판 id. 같은 방에서 판이 두 번 안 열리게 막는 거야
const roomGameSession = new Map()

// 판 열 때(commitGameSession) 셋 다 넣고, 판 닫을 때(endGameSessionForPlayer) 셋 다 지움
// 하나만 지우면 장부끼리 안 맞음
module.exports = { gameSessions, playerSession, roomGameSession }