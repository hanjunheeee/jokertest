// 동시 접속 스냅샷 저장소 파일, 스냅샷 한 줄 저장
// 동시 접속 서비스가 부름, 시험은 가짜 model을 넘김

// model 넘기면 그것, 없으면 진짜 모델을 부를 때 꺼내서 한 줄 만듦
async function saveSnapshot(row, { model } = {}) {
    const ConcurrentSnapshot = model ?? require('../../models').ConcurrentSnapshot
    await ConcurrentSnapshot.create(row)
}

module.exports = {
    saveSnapshot,
}
