// 접속 카테고리 입구, 접속 상태 저장·친구 uuid + 동시 접속 스냅샷 이름 모아서 내보냄
// 시험이 갈아끼우는 함수는 ./status · ./concurrency 입구로 부름 (이 묶음은 복사본)
module.exports = {
    ...require('./status'),
    ...require('./concurrency'),
}
