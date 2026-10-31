// 판 결과 입구, 상수·전적 기록·결과 공개 묶어서 내보냄
module.exports = {
    ...require('./constants'),
    ...require('./record'),
    ...require('./reveal'),
}