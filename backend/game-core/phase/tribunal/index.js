// 재판 입구, 상수·투표함·투표 받기·판정 묶어서 내보냄
module.exports = {
    ...require('./constants'),
    ...require('./ballots'),
    ...require('./vote'),
    ...require('./resolve'),
}