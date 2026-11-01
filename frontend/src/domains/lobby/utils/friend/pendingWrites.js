// 목록 응답보다 늦게 한 로컬 변경만 남겨 덮어쓰는 계산
// friend 스토어의 목록 불러오기·받은 신청 교체 액션이 씀

// 응답 번호표보다 뒤에 지운 받은 신청만 남김 (늦은 응답이 지운 줄을 되살리지 못하게 함)
export function newerRemovals(removals, ticket) {
    const pending = {};
    for (const [id, seq] of Object.entries(removals)) {
        if (seq > ticket) pending[id] = seq;
    }
    return pending;
}

// 응답 뒤에 저장한 즐겨찾기 변경을 응답 목록 위에 다시 얹음
export function applyFavoriteWrites(ids, writes, ticket) {
    const next = new Set(Array.isArray(ids) ? ids : []);
    const pending = {};
    for (const [friendId, write] of Object.entries(writes)) {
        if (write.seq <= ticket) continue;
        pending[friendId] = write;
        if (write.favorite) next.add(friendId); else next.delete(friendId);
    }
    return { next, pending };
}
