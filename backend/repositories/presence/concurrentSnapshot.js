// 동시 접속 기록 저장소 파일, 기록 한 줄 저장
// 동시 접속 서비스(presence/concurrency/snapshot.js)가 부름, 시험은 가짜 model을 넘김

// model 넘기면 그것, 없으면 그때 진짜 모델을 꺼내서 한 줄 만듦 (넘기면 models를 아예 안 불러옴)
async function saveSnapshot(row, { model } = {}) {
    const ConcurrentSnapshot = model ?? require('../../models').ConcurrentSnapshot
    await ConcurrentSnapshot.create(row)
}

module.exports = {
    saveSnapshot,
}
