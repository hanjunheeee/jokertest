// 판 결과 읽기 파일, 판 id 하나로 결과·참가자 읽기
// game 결과 컨트롤러가 부름 (저장소 모듈 객체로 불러 시험 갈아끼우기 먹게)
const gameResultRepository = require('../../../repositories/game/result')

// 판 하나 결과 (없으면 null), 저장소 Promise 그대로 돌려줌
const findGameResultById = (gameId) => gameResultRepository.findGameResultById(gameId)

module.exports = { findGameResultById }
