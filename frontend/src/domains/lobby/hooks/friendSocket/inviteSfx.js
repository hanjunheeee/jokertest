// 친구·게임 초대 효과음 내기와 초대 스냅샷 다시 받기
// 친구 소켓 사건 처리(handlers)·초대 수락 흐름·소켓 훅 입구가 씀
import { useGameInviteStore } from "../../store/gameInvite.store.js";
import { useAuthStore } from "../../../auth/store/auth.store.js";
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js";
import { useNotificationsStore } from "../../../notifications/store/notifications.store.js";
import {
    recordInviteSfxObservation,
    trackInviteSfxCompletion,
} from "../../diagnostics/inviteSfxDiagnostics.js";

// 로그인 계정 id (없으면 null)
const myAccountId = () => {
    const { user, isLoggedIn } = useAuthStore.getState();
    return isLoggedIn && user?.uuid ? user.uuid : null;
};

// 친구 신청 소리: 내 계정 사건이고 알림 쪽에서 처음 보는 사건일 때만 냄
export function playFriendSfx(sfxEvent) {
    if (sfxEvent === null || typeof sfxEvent !== "object") return;
    const accountId = myAccountId();
    if (accountId === null) return;
    if (sfxEvent.accountId !== accountId) return;

    // 같은 사건 소리는 알림 스토어가 한 번만 허락함
    if (!useNotificationsStore.getState().consumeSoundEvent(accountId, sfxEvent.eventId)) return;

    dispatchSfxEvent({
        kind: sfxEvent.kind,
        eventId: sfxEvent.eventId,
        accountId,
        origin: sfxEvent.origin,
    });
}

// 게임 초대 소리: 스토어가 허락할 때만 내고, 안 낸 이유·결과를 진단 기록에 남김
export function playGameInviteSfx(payload) {
    const sfxEvent = payload?.sfxEvent;
    const invite = payload?.invite;
    if (sfxEvent === null || typeof sfxEvent !== "object") return;

    const accountId = myAccountId();
    if (accountId === null) return;
    // 다른 계정 사건이면 진단만 남기고 끝
    if (sfxEvent.accountId !== accountId) {
        recordInviteSfxObservation(() => ({
            phase: "received", accountId: sfxEvent.accountId, inviteId: invite?.inviteId ?? null,
            eventId: sfxEvent.eventId ?? null, eligible: false, reason: "account-mismatch",
        }));
        return;
    }

    // 스토어가 막으면 막은 이유를 진단에 남김
    if (!useGameInviteStore.getState().consumeInviteSound(accountId, invite)) {
        recordInviteSfxObservation(() => ({
            phase: "received", accountId, inviteId: invite?.inviteId ?? null,
            eventId: sfxEvent.eventId ?? null, creationSeq: invite?.creationSeq ?? null,
            eligible: false,
            reason: useGameInviteStore.getState().explainInviteSound(accountId, invite).reason,
        }));
        return;
    }

    // 소리 내고, 재생기 응답·재생 끝남을 진단에 남김
    const result = dispatchSfxEvent({
        kind: sfxEvent.kind,
        eventId: sfxEvent.eventId,
        accountId,
        origin: sfxEvent.origin,
    });

    const seq = recordInviteSfxObservation(() => ({
        phase: "received", accountId, inviteId: invite?.inviteId ?? null,
        eventId: sfxEvent.eventId ?? null, creationSeq: invite?.creationSeq ?? null,
        eligible: true, reason: null,
        dispatchStatus: result?.status ?? null,
        dispatchReason: result?.reason ?? null,
    }));
    trackInviteSfxCompletion(seq, result?.completion);
}

// 스냅샷을 다시 받고, 복원 중 미뤄 둔 새 초대 소리를 이제 냄
export async function loadInviteSnapshotAndPlayNew() {
    const result = await useGameInviteStore.getState().loadSnapshot();
    if (result?.ok !== true) return result;
    for (const candidate of result.soundCandidates ?? []) {
        playGameInviteSfx(candidate);
    }
    return result;
}
