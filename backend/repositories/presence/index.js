// 접속 저장소 입구, 동시 접속 스냅샷 저장 모아서 내보냄
// 접속 서비스가 이 입구로 부름
module.exports = {
    ...require('./concurrentSnapshot'),
}
