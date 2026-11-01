// 겹 Map 다루기 파일
// 바깥 Map 안의 Map·Set 꺼내기(없으면 만듦) + 비면 바깥에서 지우기
// 채널 제외 목록·끊김 유예·밤 성공 영수증·밤 대기 보관함이 같이 씀

// 안쪽 묶음 꺼내기, 없으면 make()로 새로 만들어 넣음
function getOrCreate(outer, key, make) {
    let inner = outer.get(key)
    if (!inner) {
        inner = make()
        outer.set(key, inner)
    }
    return inner
}

// 안쪽에서 하나 지우고, 안쪽이 비면 바깥 칸도 지움 (빈 묶음이 쌓이지 않게)
function deleteNested(outer, key, innerKey) {
    const inner = outer.get(key)
    if (!inner) return
    inner.delete(innerKey)
    if (inner.size === 0) outer.delete(key)
}

module.exports = { getOrCreate, deleteNested }
