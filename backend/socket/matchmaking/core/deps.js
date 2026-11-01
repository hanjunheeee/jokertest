// 바깥 의존 주입구 파일
// 접속 목록·초대·사용자 서비스·경제·전적 통계 서비스 참조 묶음, 시험이 가짜로 갈아끼움
const userService = require('../../../services/user')
const economyService = require('../../../services/economy')
const roleStatisticsQueries = require('../../../services/game/roleStatistics/queries')
const gameInviteModule = require('../../../services/friend/gameInvite')

// 지금 쓰는 참조 묶음 (바꿀 땐 이 객체 칸만 바꿈, matchmaking 안에서는 deps.xxx로 읽음)
const deps = {
    // socket.js가 넣어 주는 접속 목록 (uuid → 소켓 id)
    onlineUsersRegistry: null,
    gameInviteService: gameInviteModule,
    // 칸 이름 두 개는 시험 가짜 넣는 자리와 맞춰 그대로 둠 (이름 바꾸기는 다음 차례)
    userRepository: userService,
    economyService,
    gameResultRepository: roleStatisticsQueries,
}

// socket.js가 접속 목록 넣어 줌
function setOnlineUsersRegistry(registry) {
    deps.onlineUsersRegistry = registry
}

// 시험용: 초대 서비스 갈아끼우기 (null이면 원래 것)
function __setGameInviteServiceForTests(fakeService) {
    deps.gameInviteService = fakeService ?? gameInviteModule
}

// 시험용: 사용자 서비스 갈아끼우기 (null이면 원래 것)
function __setUserRepositoryForTests(fakeRepository) {
    deps.userRepository = fakeRepository ?? userService
}

// 시험용: 경제 서비스 갈아끼우기
function __setEconomyServiceForTests(fakeEconomyService) {
    deps.economyService = fakeEconomyService ?? economyService
}

// 시험용: 전적 통계 서비스 갈아끼우기 (null이면 원래 것)
function __setGameResultRepositoryForTests(fakeRepository) {
    deps.gameResultRepository = fakeRepository ?? roleStatisticsQueries
}

module.exports = {
    deps,
    setOnlineUsersRegistry,
    __setGameInviteServiceForTests,
    __setUserRepositoryForTests,
    __setEconomyServiceForTests,
    __setGameResultRepositoryForTests,
}
