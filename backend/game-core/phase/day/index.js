// 낮 입구, 상수·낮 상태·투표함·표 받기·준비·판정 묶어서 내보냄
module.exports = {
    ...require('./constants'),
    ...require('./state'),
    ...require('./ballots'),
    ...require('./vote'),
    ...require('./ready'),
    ...require('./resolve'),
}