// 초대 스냅샷 응답을 지금 상태에 합치는 계산 (상태는 안 건드림)
// gameInvite 스토어의 loadSnapshot이 결과 patch를 그대로 set 함
import { compareSeq, isUsable, merge, survives } from "./invites.js";

// 스냅샷 + 기다리던 실시간 초대를 합친 patch와 loadSnapshot 반환값을 만듦
export function mergeSnapshot(state, data, ticket) {
    const rows = Array.isArray(data?.invites) ? data.invites.filter(isUsable) : [];
    const cursor = typeof data?.cursor === "string" && /^\d+$/.test(data.cursor) ? data.cursor : "0";

    // 늦게 온 옛 스냅샷이면 커서·대기 목록을 지금 것으로 둠
    const cursorDelta = compareSeq(cursor, state.cursor);
    const knownWorse = cursorDelta < 0;

    // 같은 경계의 재조회는 두 스냅샷 모두에 있는 대기 초대만 믿음
    const sameBoundary = cursorDelta === 0 && state.snapshotSeq > 0;

    const effectiveCursor = knownWorse ? state.cursor : cursor;
    const incomingPendingIds = new Set(rows.map((row) => row.inviteId));
    let pendingIds;
    if (knownWorse) {
        pendingIds = state.snapshotPendingIds;
    } else if (sameBoundary) {
        pendingIds = new Set();
        for (const inviteId of state.snapshotPendingIds) {
            if (incomingPendingIds.has(inviteId)) pendingIds.add(inviteId);
        }
    } else {
        pendingIds = incomingPendingIds;
    }

    // 스냅샷에 있던 초대는 소리를 이미 낸 걸로 봄
    const soundConsumed = new Set(state.soundConsumed);
    for (const row of rows) soundConsumed.add(row.inviteId);

    // 커서 아래로 내려간 버퍼 초대도 소리 안 냄
    const buffered = state.liveBuffer.filter((item) => isUsable(item?.invite));
    for (const item of buffered) {
        if (compareSeq(item.invite.creationSeq, effectiveCursor) <= 0) {
            soundConsumed.add(item.invite.inviteId);
        }
    }

    // 복원 끝난 뒤 소리 낼 버퍼 초대
    const soundCandidates = buffered.filter((item) => (
        item.sfxEvent !== null && item.sfxEvent !== undefined
        && compareSeq(item.invite.creationSeq, effectiveCursor) > 0
        && !soundConsumed.has(item.invite.inviteId)
    ));

    // 남길 줄: 기존·버퍼 줄은 늘 거르고, 옛·같은 경계 스냅샷이면 들어온 줄도 거름
    const keep = (invite) => survives(invite, pendingIds, effectiveCursor);
    const retained = state.invites.filter(keep);
    const incoming = knownWorse || sameBoundary
        ? rows.filter(keep)
        : rows;
    const bufferedInvites = buffered.map((item) => item.invite).filter(keep);

    // 버퍼 비우고 복원 끝 표시, 미룬 소리 후보는 결과로 돌려줌
    return {
        patch: {
            invites: merge(retained, [...incoming, ...bufferedInvites]),
            cursor: effectiveCursor,
            snapshotPendingIds: pendingIds,
            snapshotSeq: knownWorse ? state.snapshotSeq : Math.max(state.snapshotSeq, ticket),
            soundConsumed,
            liveBuffer: [],
            snapshotLoaded: true,
            restorePending: false,
            status: "success",
            error: null,
        },
        result: { ok: true, count: rows.length, cursor: effectiveCursor, soundCandidates, stale: knownWorse },
    };
}
