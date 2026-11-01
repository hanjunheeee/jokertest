// 게임 초대 소리를 낼지 판정 (이유 코드까지 돌려줌)
// gameInvite 스토어의 소리 액션이 씀
import { compareSeq, isUsable } from "./invites.js";

// 초대 소리를 낼지 판정, 막히면 막힌 이유 코드를 같이 줌
export function evalSound(state, accountId, invite, now = Date.now()) {
    // 다른 계정·못 쓰는 줄·내가 받는 초대 아님·이미 소리 냄·복원 중·커서 이하면 막기
    if (accountId === null || accountId !== state.accountId) return { eligible: false, reason: "account-mismatch" };
    if (!isUsable(invite)) return { eligible: false, reason: "invalid-invite" };
    if (invite.receiverId !== accountId) return { eligible: false, reason: "receiver-mismatch" };
    if (state.soundConsumed.has(invite.inviteId)) return { eligible: false, reason: "already-consumed" };
    if (!state.snapshotLoaded || state.restorePending) return { eligible: false, reason: "restore-pending" };
    if (compareSeq(invite.creationSeq, state.cursor) <= 0) {
        return { eligible: false, reason: "at-or-below-cursor" };
    }

    // 더 새 revision이 목록에 있으면 그걸로 상태·만료를 봄
    const latest = state.invites.find((item) => item.inviteId === invite.inviteId);
    const effective = latest !== undefined && latest.revision > invite.revision ? latest : invite;
    // 끝난 초대·시간 지난 초대면 막기
    if (effective.status !== "PENDING") return { eligible: false, reason: `terminal-${effective.status}` };
    const expiresAt = Date.parse(effective.expiresAt ?? "");
    if (Number.isFinite(expiresAt) && expiresAt <= now) return { eligible: false, reason: "expired" };

    return { eligible: true, reason: null };
}
