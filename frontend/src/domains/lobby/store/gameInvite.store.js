import { create } from "zustand";

import {
    createGameInviteApi,
    declineGameInviteApi,
    fetchGameInviteSnapshot,
} from "../api/friend.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

export function compareCreationSeq(left, right) {
    const a = String(left ?? "0").replace(/^0+(?=\d)/, "");
    const b = String(right ?? "0").replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return NaN;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
}

export function isUsableInvite(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.inviteId !== "string" || value.inviteId.length === 0) return false;
    if (typeof value.receiverId !== "string" || value.receiverId.length === 0) return false;
    if (typeof value.status !== "string" || value.status.length === 0) return false;
    if (!Number.isInteger(value.revision)) return false;
    if (typeof value.creationSeq !== "string" || !/^\d+$/.test(value.creationSeq)) return false;
    return true;
}

export function survivesSnapshot(invite, snapshotIds, cursor) {
    if (snapshotIds.has(invite.inviteId)) return true;
    if (invite.status !== "PENDING") return true;
    return compareCreationSeq(invite.creationSeq, cursor) > 0;
}

export function mergeInvites(existing, incoming) {
    const byId = new Map();
    for (const item of existing) byId.set(item.inviteId, item);
    for (const raw of incoming) {
        if (!isUsableInvite(raw)) continue;
        const previous = byId.get(raw.inviteId);
        if (previous === undefined || raw.revision >= previous.revision) {
            byId.set(raw.inviteId, raw);
        }
    }
    return [...byId.values()].sort((a, b) => compareCreationSeq(b.creationSeq, a.creationSeq));
}

function readAuthAccountId() {
    const auth = useAuthStore.getState();
    return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
        ? auth.user.uuid
        : null;
}

let lifecycleCounter = 0;
function newSendLifecycleId() {
    lifecycleCounter += 1;
    const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
    return `${lifecycleCounter.toString(36)}${random}`.slice(0, 12);
}

export function establishesTerminalRefusal(status) {
    if (!Number.isInteger(status)) return false;
    if (status === 408 || status === 425 || status === 429) return false;
    return status >= 400 && status < 500;
}

let operationCounter = 0;
const nextOperationId = () => (operationCounter += 1);

let snapshotSeqCounter = 0;
const nextSnapshotSeq = () => (snapshotSeqCounter += 1);

export function isActionablePending(invite, snapshotPendingIds, cursor, snapshotLoaded) {
    if (invite.status !== "PENDING") return true;
    if (!snapshotLoaded) return true;
    if (snapshotPendingIds.has(invite.inviteId)) return true;
    return compareCreationSeq(invite.creationSeq, cursor) > 0;
}

export function evaluateInviteSound(state, accountId, invite, now = Date.now()) {
    if (accountId === null || accountId !== state.accountId) return { eligible: false, reason: "account-mismatch" };
    if (!isUsableInvite(invite)) return { eligible: false, reason: "invalid-invite" };
    if (invite.receiverId !== accountId) return { eligible: false, reason: "receiver-mismatch" };
    if (state.soundConsumed.has(invite.inviteId)) return { eligible: false, reason: "already-consumed" };
    if (!state.snapshotLoaded || state.restorePending) return { eligible: false, reason: "restore-pending" };
    if (compareCreationSeq(invite.creationSeq, state.cursor) <= 0) {
        return { eligible: false, reason: "at-or-below-cursor" };
    }

    const latest = state.invites.find((item) => item.inviteId === invite.inviteId);
    const effective = latest !== undefined && latest.revision > invite.revision ? latest : invite;
    if (effective.status !== "PENDING") return { eligible: false, reason: `terminal-${effective.status}` };
    const expiresAt = Date.parse(effective.expiresAt ?? "");
    if (Number.isFinite(expiresAt) && expiresAt <= now) return { eligible: false, reason: "expired" };

    return { eligible: true, reason: null };
}

const initialAccountState = () => ({
    status: "idle", // idle | loading | success | error
    error: null,
    invites: [],
    cursor: "0",
    snapshotPendingIds: new Set(),
    snapshotSeq: 0,
    snapshotLoaded: false,
    restorePending: false,
    liveBuffer: [],
    soundConsumed: new Set(),
    pendingInviteIds: new Set(),
    acceptOwners: {},
    inviteErrors: {},
    sendingReceiverIds: new Set(),
    sendErrors: {},
    sendKeys: {},

    sendLifecycleId: newSendLifecycleId(),
});

const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});

export const useGameInviteStore = create((set, get) => ({
    ...initialState(),

    syncAccount: () => {
        const next = readAuthAccountId();
        const state = get();
        if (state.accountId === next) return state.accountGeneration;
        const accountGeneration = state.accountGeneration + 1;
        set({ accountId: next, accountGeneration, ...initialAccountState() });
        return accountGeneration;
    },

    isCurrent: (accountGeneration) => get().accountGeneration === accountGeneration,

    beginResync: () => set({ snapshotLoaded: false, restorePending: true, liveBuffer: [] }),

    loadSnapshot: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };

        const ticket = nextSnapshotSeq();
        set({ status: "loading", error: null, restorePending: true });

        let data;
        try {
            data = await fetchGameInviteSnapshot();
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (get().snapshotSeq >= ticket) return { ok: false, reason: "superseded", superseded: true };
            set({ status: "error", error: error?.message ?? "초대를 불러오지 못했습니다." });
            return { ok: false, reason: "error" };
        }

        if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };

        const rows = Array.isArray(data?.invites) ? data.invites.filter(isUsableInvite) : [];
        const cursor = typeof data?.cursor === "string" && /^\d+$/.test(data.cursor) ? data.cursor : "0";
        const state = get();

        const cursorDelta = compareCreationSeq(cursor, state.cursor);
        const knownWorse = cursorDelta < 0;

        const sameBoundary = cursorDelta === 0 && state.snapshotSeq > 0;

        const effectiveCursor = knownWorse ? state.cursor : cursor;
        const incomingPendingIds = new Set(rows.map((row) => row.inviteId));
        let effectivePendingIds;
        if (knownWorse) {
            effectivePendingIds = state.snapshotPendingIds;
        } else if (sameBoundary) {
            effectivePendingIds = new Set();
            for (const inviteId of state.snapshotPendingIds) {
                if (incomingPendingIds.has(inviteId)) effectivePendingIds.add(inviteId);
            }
        } else {
            effectivePendingIds = incomingPendingIds;
        }

        const soundConsumed = new Set(state.soundConsumed);
        for (const row of rows) soundConsumed.add(row.inviteId);

        const buffered = state.liveBuffer.filter((item) => isUsableInvite(item?.invite));
        for (const item of buffered) {
            if (compareCreationSeq(item.invite.creationSeq, effectiveCursor) <= 0) {
                soundConsumed.add(item.invite.inviteId);
            }
        }

        const soundCandidates = buffered.filter((item) => (
            item.sfxEvent !== null && item.sfxEvent !== undefined
            && compareCreationSeq(item.invite.creationSeq, effectiveCursor) > 0
            && !soundConsumed.has(item.invite.inviteId)
        ));

        const survives = (invite) => survivesSnapshot(invite, effectivePendingIds, effectiveCursor);
        const retained = state.invites.filter(survives);
        const incoming = knownWorse || sameBoundary
            ? rows.filter(survives)
            : rows;
        const bufferedInvites = buffered.map((item) => item.invite).filter(survives);

        set({
            invites: mergeInvites(retained, [...incoming, ...bufferedInvites]),
            cursor: effectiveCursor,
            snapshotPendingIds: effectivePendingIds,
            snapshotSeq: knownWorse ? state.snapshotSeq : Math.max(state.snapshotSeq, ticket),
            soundConsumed,
            liveBuffer: [],
            snapshotLoaded: true,
            restorePending: false,
            status: "success",
            error: null,
        });
        return { ok: true, count: rows.length, cursor: effectiveCursor, soundCandidates, stale: knownWorse };
    },

    receiveLiveInvite: (accountId, invite, sfxEvent = null) => {
        const state = get();
        if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" };
        if (!isUsableInvite(invite)) return { applied: false, reason: "invalid" };
        if (invite.receiverId !== accountId) return { applied: false, reason: "receiver-mismatch" };

        if (!state.snapshotLoaded) {
            set({ liveBuffer: [...state.liveBuffer, { invite, sfxEvent }] });
            return { applied: false, reason: "buffered" };
        }

        if (!isActionablePending(invite, state.snapshotPendingIds, state.cursor, state.snapshotLoaded)) {
            return { applied: false, reason: "known-terminal" };
        }

        const invites = mergeInvites(state.invites, [invite]);

        if (state.restorePending
            && sfxEvent !== null && sfxEvent !== undefined
            && !state.soundConsumed.has(invite.inviteId)) {
            set({ invites, liveBuffer: [...state.liveBuffer, { invite, sfxEvent }] });
            return { applied: true, deferredSound: true };
        }

        set({ invites });
        return { applied: true };
    },

    consumeInviteSound: (accountId, invite, now = Date.now()) => {
        get().syncAccount();
        const state = get();
        if (!evaluateInviteSound(state, accountId, invite, now).eligible) return false;

        const soundConsumed = new Set(state.soundConsumed);
        soundConsumed.add(invite.inviteId);
        set({ soundConsumed });
        return true;
    },

    explainInviteSound: (accountId, invite, now = Date.now()) => (
        evaluateInviteSound(get(), accountId, invite, now)
    ),

    declineInvite: async (inviteId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        if (get().pendingInviteIds.has(inviteId)) return { ok: false, reason: "in-progress" };

        set((state) => ({
            pendingInviteIds: new Set(state.pendingInviteIds).add(inviteId),
            inviteErrors: Object.fromEntries(
                Object.entries(state.inviteErrors).filter(([id]) => id !== inviteId),
            ),
        }));
        const clearPending = () => set((state) => {
            const next = new Set(state.pendingInviteIds);
            next.delete(inviteId);
            return { pendingInviteIds: next };
        });

        try {
            const invite = await declineGameInviteApi(inviteId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            if (isUsableInvite(invite)) {
                set((state) => ({ invites: mergeInvites(state.invites, [invite]) }));
            }
            return { ok: true, invite };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            set((state) => ({
                inviteErrors: { ...state.inviteErrors, [inviteId]: error?.message ?? "초대를 거절하지 못했습니다." },
            }));
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    sendInvite: async (receiverId, keyScope) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        if (get().sendingReceiverIds.has(receiverId)) return { ok: false, reason: "in-progress" };

        const scope = typeof keyScope === "string" && keyScope.length > 0 ? keyScope : receiverId;
        const attempt = get().sendKeys[scope] ?? 1;
        const creationKey = `${scope}:${get().sendLifecycleId}:${attempt}`;

        set((state) => ({
            sendingReceiverIds: new Set(state.sendingReceiverIds).add(receiverId),
            sendErrors: Object.fromEntries(
                Object.entries(state.sendErrors).filter(([id]) => id !== receiverId),
            ),
        }));
        const clearSending = () => set((state) => {
            const next = new Set(state.sendingReceiverIds);
            next.delete(receiverId);
            return { sendingReceiverIds: next };
        });
        const advanceKey = () => set((state) => (
            (state.sendKeys[scope] ?? 1) !== attempt
                ? {}
                : { sendKeys: { ...state.sendKeys, [scope]: attempt + 1 } }
        ));

        try {
            const invite = await createGameInviteApi(receiverId, creationKey);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearSending();
            advanceKey();
            return { ok: true, invite, creationKey };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearSending();
            if (establishesTerminalRefusal(error?.status)) advanceKey();
            set((state) => ({
                sendErrors: { ...state.sendErrors, [receiverId]: error?.message ?? "초대를 보내지 못했습니다." },
            }));
            return { ok: false, reason: "error", message: error?.message, creationKey };
        }
    },

    beginAcceptOperation: () => nextOperationId(),

    markAcceptPending: (inviteId, pending, owner = undefined) => set((state) => {
        if (pending) {
            const next = new Set(state.pendingInviteIds).add(inviteId);
            return owner === undefined
                ? { pendingInviteIds: next }
                : { pendingInviteIds: next, acceptOwners: { ...state.acceptOwners, [inviteId]: owner } };
        }
        if (owner !== undefined && state.acceptOwners[inviteId] !== owner) return {};
        const next = new Set(state.pendingInviteIds);
        next.delete(inviteId);
        return {
            pendingInviteIds: next,
            acceptOwners: Object.fromEntries(
                Object.entries(state.acceptOwners).filter(([id]) => id !== inviteId),
            ),
        };
    }),

    setInviteError: (inviteId, message) => set((state) => ({
        inviteErrors: message === null
            ? Object.fromEntries(Object.entries(state.inviteErrors).filter(([id]) => id !== inviteId))
            : { ...state.inviteErrors, [inviteId]: message },
    })),

    reset: () => set(initialAccountState()),
    __resetForTests: () => set(initialState()),
}));

export function selectPendingInvites(invites, now = Date.now()) {
    return invites.filter((invite) => {
        if (invite.status !== "PENDING") return false;
        const expiresAt = Date.parse(invite.expiresAt ?? "");
        return !Number.isFinite(expiresAt) || expiresAt > now;
    });
}
