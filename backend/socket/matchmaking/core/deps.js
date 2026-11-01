// 바깥 의존 주입구 파일
// 접속 목록·초대·사용자·경제·전적 저장소 참조 묶음, 시험이 가짜로 갈아끼움
const userRepository = require('../../../repositories/user')
const economyService = require('../../../services/economy')
const gameResultRepository = require('../../../repositories/game/result')
const gameInviteModule = require('../../../services/friend/gameInvite')

// 지금 쓰는 참조 묶음 (바꿀 땐 이 객체 칸만 바꿈, matchmaking 안에서는 deps.xxx로 읽음)
const deps = {
    // socket.js가 넣어 주는 접속 목록 (uuid → 소켓 id)
    onlineUsersRegistry: null,
    gameInviteService: gameInviteModule,
    userRepository,
    economyService,
    gameResultRepository,
}

// socket.js가 접속 목록 넣어 줌
function setOnlineUsersRegistry(registry) {
    deps.onlineUsersRegistry = registry
}

// 시험용: 초대 서비스 갈아끼우기 (null이면 원래 것)
function __setGameInviteServiceForTests(fakeService) {
    deps.gameInviteService = fakeService ?? gameInviteModule
}

// 시험용: 사용자 저장소 갈아끼우기
function __setUserRepositoryForTests(fakeRepository) {
    deps.userRepository = fakeRepository ?? userRepository
}

// 시험용: 경제 서비스 갈아끼우기
function __setEconomyServiceForTests(fakeEconomyService) {
    deps.economyService = fakeEconomyService ?? economyService
}

// 시험용: 전적 저장소 갈아끼우기
function __setGameResultRepositoryForTests(fakeRepository) {
    deps.gameResultRepository = fakeRepository ?? gameResultRepository
}

module.exports = {
    deps,
    setOnlineUsersRegistry,
    __setGameInviteServiceForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameResultRepositoryForTests,
}
