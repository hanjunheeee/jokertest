// 판 조회 입구, 진행 중 판·끝난 판 찾기 묶어서 내보냄
module.exports = {
    ...require('./live'),
    ...require('./ended'),
}