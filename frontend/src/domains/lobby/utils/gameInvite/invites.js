// 게임 초대 줄 다루기 (순번 비교·쓸 수 있는 줄인지·합치기·남길지)
// gameInvite 스토어 액션과 입구 파일이 씀

// creationSeq 비교: 큰 숫자 문자열이라 길이 먼저 보고 글자 순으로 봄
export function compareSeq(left, right) {
    const a = String(left ?? "0").replace(/^0+(?=\d)/, "");
    const b = String(right ?? "0").replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return NaN;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
}

// 서버가 준 초대 줄이 필수 칸을 다 갖췄는지
export function isUsable(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.inviteId !== "string" || value.inviteId.length === 0) return false;
    if (typeof value.receiverId !== "string" || value.receiverId.length === 0) return false;
    if (typeof value.status !== "string" || value.status.length === 0) return false;
    if (!Number.isInteger(value.revision)) return false;
    if (typeof value.creationSeq !== "string" || !/^\d+$/.test(value.creationSeq)) return false;
    return true;
}

// 스냅샷 뒤에도 남길 줄인지: 스냅샷에 있거나, 끝난 줄이거나, 커서보다 새 줄
export function survives(invite, snapshotIds, cursor) {
    if (snapshotIds.has(invite.inviteId)) return true;
    if (invite.status !== "PENDING") return true;
    return compareSeq(invite.creationSeq, cursor) > 0;
}

// 같은 초대는 revision 큰 쪽으로 덮고 새 순번부터 정렬함
export function merge(existing, incoming) {
    const byId = new Map();
    for (const item of existing) byId.set(item.inviteId, item);
    for (const raw of incoming) {
        if (!isUsable(raw)) continue;
        const previous = byId.get(raw.inviteId);
        if (previous === undefined || raw.revision >= previous.revision) {
            byId.set(raw.inviteId, raw);
        }
    }
    return [...byId.values()].sort((a, b) => compareSeq(b.creationSeq, a.creationSeq));
}

// 실시간으로 온 대기 초대를 받아도 되는지 (스냅샷이 이미 끝난 걸로 본 줄은 막기)
export function isActionable(invite, snapshotPendingIds, cursor, snapshotLoaded) {
    if (invite.status !== "PENDING") return true;
    if (!snapshotLoaded) return true;
    if (snapshotPendingIds.has(invite.inviteId)) return true;
    return compareSeq(invite.creationSeq, cursor) > 0;
}

// 보낸 초대 거절이 확정인지: 408·425·429는 다시 보낼 수 있어 빼고 4xx만 확정으로 봄
export function isTerminalRefusal(status) {
    if (!Number.isInteger(status)) return false;
    if (status === 408 || status === 425 || status === 429) return false;
    return status >= 400 && status < 500;
}

// 화면에 보일 대기 초대: 대기 상태이고 아직 안 지난 것만
export function selectPending(invites, now = Date.now()) {
    return invites.filter((invite) => {
        if (invite.status !== "PENDING") return false;
        const expiresAt = Date.parse(invite.expiresAt ?? "");
        return !Number.isFinite(expiresAt) || expiresAt > now;
    });
}
