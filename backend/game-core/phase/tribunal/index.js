// 재판 입구, 상수·투표함·투표 받기·판정·방송 내용 묶어서 내보냄
// gameSession.js·나가기·스냅샷이 이 입구로 가져다 씀
module.exports = {
    ...require('./constants'),
    ...require('./ballots'),
    ...require('./vote'),
    ...require('./resolve'),
    ...require('./payloads'),
}