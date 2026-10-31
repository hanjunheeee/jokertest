import { useEffect } from "react";
import { useFriendStore } from "../store/friend.store.js";
import { useGameInviteStore } from "../store/gameInvite.store.js";
import { useAuthStore } from "../../auth/store/auth.store.js";
import { dispatchSfxEvent } from "../../../shared/hooks/useSfxRuntime.js";
import { useNotificationsStore } from "../../notifications/store/notifications.store.js";
import { getSocket } from "../../../shared/socket/socketClient.js";
import { useMatchingStore } from "../../game/matching/store/matchingStore.js";
import { useInGameStore } from "../../game/ingame/store/ingameStore.js";
import {
    recordInviteSfxObservation,
    syncInviteSfxDiagnosticsAccount,
    trackInviteSfxCompletion,
} from "../diagnostics/inviteSfxDiagnostics.js";

function playFriendSfx(sfxEvent) {
    if (sfxEvent === null || typeof sfxEvent !== "object") return;
    const { user, isLoggedIn } = useAuthStore.getState();
    const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
    if (accountId === null) return;
    if (sfxEvent.accountId !== accountId) return;

    if (!useNotificationsStore.getState().consumeSoundEvent(accountId, sfxEvent.eventId)) return;

    dispatchSfxEvent({
        kind: sfxEvent.kind,
        eventId: sfxEvent.eventId,
        accountId,
        origin: sfxEvent.origin,
    });
}

export function playGameInviteSfx(payload) {
    const sfxEvent = payload?.sfxEvent;
    const invite = payload?.invite;
    if (sfxEvent === null || typeof sfxEvent !== "object") return;

    const { user, isLoggedIn } = useAuthStore.getState();
    const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
    if (accountId === null) return;
    if (sfxEvent.accountId !== accountId) {
        recordInviteSfxObservation(() => ({
            phase: "received", accountId: sfxEvent.accountId, inviteId: invite?.inviteId ?? null,
            eventId: sfxEvent.eventId ?? null, eligible: false, reason: "account-mismatch",
        }));
        return;
    }

    if (!useGameInviteStore.getState().consumeInviteSound(accountId, invite)) {
        recordInviteSfxObservation(() => ({
            phase: "received", accountId, inviteId: invite?.inviteId ?? null,
            eventId: sfxEvent.eventId ?? null, creationSeq: invite?.creationSeq ?? null,
            eligible: false,
            reason: useGameInviteStore.getState().explainInviteSound(accountId, invite).reason,
        }));
        return;
    }

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

let navigateToApp = null;

export const INVITE_ACCEPT_TIMEOUT_MS = 15000;

export const INVITE_VERIFY_TIMEOUT_MS = 5000;

export async function loadInviteSnapshotAndPlayNew() {
    const result = await useGameInviteStore.getState().loadSnapshot();
    if (result?.ok !== true) return result;
    for (const candidate of result.soundCandidates ?? []) {
        playGameInviteSfx(candidate);
    }
    return result;
}

function emitWithAck(socket, event, payload, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
        const timer = setTimeout(() => finish({ ok: false, code: "UNKNOWN", unknown: true }), timeoutMs);
        try {
            socket.emit(event, payload, (ack) => {
                clearTimeout(timer);
                finish(ack ?? { ok: false, code: "UNKNOWN", unknown: true });
            });
        } catch (error) {
            clearTimeout(timer);
            finish({ ok: false, code: "EMIT_FAILED", unknown: true });
        }
    });
}

function isSameConnection(socket, connectionId) {
    if (!socket) return false;
    if (connectionId === null) return socket === getSocket();
    return socket === getSocket() && socket.id === connectionId;
}

export function shouldEnterRoomFromAccept(result) {
    if (result === null || typeof result !== "object") return false;
    if (result.ok !== true) return false;
    const room = result.room;
    if (room === null || typeof room !== "object") return false;
    return typeof room.roomId === "string" && room.roomId.length > 0;
}

export async function requestGameInviteAccept(inviteId) {
    if (typeof inviteId !== "string" || inviteId.length === 0) return { ok: false, code: "INVALID_REQUEST" };

    const accountGeneration = useGameInviteStore.getState().syncAccount();
    const store = useGameInviteStore.getState();
    if (store.pendingInviteIds.has(inviteId)) return { ok: false, code: "IN_PROGRESS" };

    const socket = getSocket();
    if (!socket) {
        store.setInviteError(inviteId, "연결이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return { ok: false, code: "NO_SOCKET" };
    }

    const connectionId = socket.id ?? null;
    const operationId = store.beginAcceptOperation();
    store.markAcceptPending(inviteId, true, operationId);
    store.setInviteError(inviteId, null);

    try {
        let result = await emitWithAck(socket, "accept_game_invite", { inviteId }, INVITE_ACCEPT_TIMEOUT_MS);

        if (result?.unknown === true
            && isSameConnection(socket, connectionId)
            && useGameInviteStore.getState().isCurrent(accountGeneration)) {
            const recovered = await emitWithAck(
                socket, "get_game_invite_result", { inviteId }, INVITE_VERIFY_TIMEOUT_MS,
            );
            if (recovered?.ok === true && recovered.pending !== true) {
                result = recovered.entered === true && recovered.room
                    ? { ok: true, room: recovered.room, inviteId, recovered: true }
                    : { ok: false, code: "NOT_ENTERED", message: "방에 입장하지 못했습니다." };
            }
        }

        if (!useGameInviteStore.getState().isCurrent(accountGeneration)) return { ok: false, code: "STALE" };

        if (!shouldEnterRoomFromAccept(result)) {
            useGameInviteStore.getState().setInviteError(
                inviteId,
                result?.unknown === true
                    ? "입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요."
                    : (result?.message ?? "초대를 수락하지 못했습니다."),
            );
            loadInviteSnapshotAndPlayNew();
            return result ?? { ok: false, code: "UNKNOWN" };
        }

        if (!isSameConnection(socket, connectionId)) {
            useGameInviteStore.getState().setInviteError(
                inviteId, "연결이 바뀌어 입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.",
            );
            loadInviteSnapshotAndPlayNew();
            return { ok: false, code: "STALE_CONNECTION", unknown: true };
        }

        const currentRoom = await emitWithAck(socket, "get_current_room", {}, INVITE_VERIFY_TIMEOUT_MS);
        const verifiedRoom = currentRoom?.ok === true ? currentRoom.room : null;
        if (!useGameInviteStore.getState().isCurrent(accountGeneration)) return { ok: false, code: "STALE" };
        if (!isSameConnection(socket, connectionId)
            || verifiedRoom === null || typeof verifiedRoom !== "object"
            || verifiedRoom.roomId !== result.room.roomId) {
            useGameInviteStore.getState().setInviteError(
                inviteId, "입장 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해주세요.",
            );
            loadInviteSnapshotAndPlayNew();
            return { ok: false, code: "ROOM_NOT_CONFIRMED", unknown: true };
        }

        useInGameStore.getState().clearGame();
        useMatchingStore.getState().setRoom(verifiedRoom);
        navigateToApp?.("/game-matching");
        return { ...result, room: verifiedRoom };
    } finally {
        useGameInviteStore.getState().markAcceptPending(inviteId, false, operationId);
    }
}

export function useFriendSocketEvents(socket, { navigate } = {}) {
    const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

    const fetchFriends = useFriendStore((state) => state.fetchFriends);

    const fetchIncomingRequests = useFriendStore((state) => state.fetchIncomingRequests);

    const removeSentRequest = useFriendStore((state) => state.removeSentRequest);

    useEffect(() => {
        navigateToApp = navigate ?? null;
        return () => { if (navigateToApp === navigate) navigateToApp = null; };
    }, [navigate]);

    useEffect(() => {
        const syncAll = () => {
            useFriendStore.getState().syncAccount();
            useGameInviteStore.getState().syncAccount();
            syncInviteSfxDiagnosticsAccount(useGameInviteStore.getState().accountId);
        };
        syncAll();
        return useAuthStore.subscribe(syncAll);
    }, []);

    useEffect(() => {
        if (!socket) return;

        const handleFriendStatusChange = ({ uuid, status }) => {
            updateFriendStatus(uuid, status);
        };

        const handleFriendRequestReceived = (payload) => {
            fetchIncomingRequests();
            playFriendSfx(payload?.sfxEvent);
        };

        const handleFriendRequestAccepted = (payload) => {
            fetchFriends();

            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        };

        const handleFriendRequestDeclined = (payload) => {
            if (payload?.byUuid) removeSentRequest(payload.byUuid);
            playFriendSfx(payload?.sfxEvent);
        };

        const handleRelationInvalidated = () => {
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchBlocks();
            loadInviteSnapshotAndPlayNew();
        };

        const handleGameInviteReceived = (payload) => {
            const { user, isLoggedIn } = useAuthStore.getState();
            const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
            playGameInviteSfx(payload);
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite, payload?.sfxEvent ?? null);
        };

        const handleGameInviteUpdated = (payload) => {
            const { user, isLoggedIn } = useAuthStore.getState();
            const accountId = isLoggedIn && user?.uuid ? user.uuid : null;
            useGameInviteStore.getState().receiveLiveInvite(accountId, payload?.invite, null);
        };

        const handleConnect = () => {
            useFriendStore.getState().syncAccount();
            useGameInviteStore.getState().syncAccount();
            useGameInviteStore.getState().beginResync();
            fetchFriends();
            fetchIncomingRequests();
            useFriendStore.getState().fetchFavorites();
            loadInviteSnapshotAndPlayNew();
        };

        socket.on("friend_status_change", handleFriendStatusChange);
        socket.on("friend_request_received", handleFriendRequestReceived);
        socket.on("friend_request_accepted", handleFriendRequestAccepted);
        socket.on("friend_request_declined", handleFriendRequestDeclined);
        socket.on("friend_relation_invalidated", handleRelationInvalidated);
        socket.on("game_invite_received", handleGameInviteReceived);
        socket.on("game_invite_updated", handleGameInviteUpdated);
        socket.on("connect", handleConnect);

        if (socket.connected) handleConnect();

        return () => {
            socket.off("friend_status_change", handleFriendStatusChange);
            socket.off("friend_request_received", handleFriendRequestReceived);
            socket.off("friend_request_accepted", handleFriendRequestAccepted);
            socket.off("friend_request_declined", handleFriendRequestDeclined);
            socket.off("friend_relation_invalidated", handleRelationInvalidated);
            socket.off("game_invite_received", handleGameInviteReceived);
            socket.off("game_invite_updated", handleGameInviteUpdated);
            socket.off("connect", handleConnect);
        };
    }, [socket, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);
}

export function __setInviteNavigateForTests(next) {
    navigateToApp = next ?? null;
}
