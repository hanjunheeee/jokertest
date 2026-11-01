'use strict';

// 경제 저장소 입구, 상품·충전 주문 (지갑·장부·보유·장착·구매·팔레트는 다음 단계) 모아서 내보냄
// 이름이 겹치지 않게 저장소마다 이름을 따로 지음
module.exports = {
    ...require('./models'),
    ...require('./currencyProduct'),
    ...require('./topupOrder'),
};
