/**
 * F-19 게임 초대 상태(AC-06/AC-07).
 *
 * 원본은 서버(game_invites 테이블)다. 이 store는 snapshot 복원과 live 전달을 합쳐 화면에
 * 보여주고, **소리 적격성 판정을 소유하는 한 경계**다. 기기에 저장하지 않는다(persist 없음) —
 * 계정 전환·로그아웃 뒤 이전 계정의 초대가 남지 않게 하는 가장 확실한 방법이다.
 *
 * 소리 계약(A-06)의 핵심 세 가지:
 *
 *   1) **커서.** 서버 snapshot이 함께 내려준 커서는 *종료된 초대까지 포함한* 수신자 전체
 *      최대 생성 순번이다. 그 이하 순번의 사건은 전부 무음이다 — 조회·복원·재접속으로
 *      다시 배달된 과거 초대가 울리지 않는 근거다. PENDING만의 최댓값을 쓰면 이미 끝난
 *      과거 초대가 "커서 이후"로 보여 새 사건으로 오인된다.
 *
 *   2) **복원 보류.** 리스너를 먼저 달기 때문에 snapshot보다 먼저 도착하는 사건이 있다.
 *      복원이 해소되기 전에는 소리 판정을 **보류**하고 버퍼에만 담는다. 조회 실패도 해소가
 *      아니다 — 못 받은 목록의 부재를 "새 사건"의 증거로 쓰지 않는다.
 *
 *   3) **표식 소모.** 한 번 후보로 인정하면 설정 off·mute로 실제 소리가 나지 않아도 표식을
 *      소모한다. 그래야 설정을 다시 켰을 때 과거 사건이 울리지 않는다.
 *
 * 상태 병합은 inviteId별 **최신 revision**으로만 한다. 지연 도착한 오래된 생성 사건이
 * 최신 terminal(거절·만료·차단 취소) 상태를 되살리지 못한다.
 */
import { create } from "zustand";

import {
    createGameInviteApi,
    declineGameInviteApi,
    fetchGameInviteSnapshot,
} from "../api/friend.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

/** BIGINT 순번을 정밀도 손실 없이 비교한다(문자열 자릿수 → 사전순). */
export function compareCreationSeq(left, right) {
    const a = String(left ?? "0").replace(/^0+(?=\d)/, "");
    const b = String(right ?? "0").replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return NaN;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
}

/** 서버가 내려준 초대 하나가 우리가 다룰 수 있는 형태인가. 아니면 버린다. */
export function isUsableInvite(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.inviteId !== "string" || value.inviteId.length === 0) return false;
    if (typeof value.receiverId !== "string" || value.receiverId.length === 0) return false;
    if (typeof value.status !== "string" || value.status.length === 0) return false;
    if (!Number.isInteger(value.revision)) return false;
    if (typeof value.creationSeq !== "string" || !/^\d+$/.test(value.creationSeq)) return false;
    return true;
}

/**
 * inviteId별로 **최신 revision**만 남기는 병합.
 * 같은 revision이면 나중 것을 쓴다(같은 상태의 재전달이라 표시가 달라지지 않는다).
 */
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

const initialAccountState = () => ({
    status: "idle", // idle | loading | success | error
    error: null,
    /** 서버에서 받은 + live로 받은 초대들(종료된 것도 상태 표시를 위해 남긴다). */
    invites: [],
    /** 종료 초대까지 포함한 수신자 전체 최대 생성 순번. 이 값 이하 사건은 전부 무음이다. */
    cursor: "0",
    /** 초기 복원을 마쳤는가. 마치기 전에 온 live는 버퍼에 둔다. */
    snapshotLoaded: false,
    /** 복원이 아직 해소되지 않았는가(실패는 해소가 아니다). */
    restorePending: false,
    liveBuffer: [],
    /** 소리 후보로 이미 소모한 inviteId들. off·mute여도 소모한다. */
    soundConsumed: new Set(),
    /** 처리 중인 inviteId들(수락·거절 중복 클릭 방지). */
    pendingInviteIds: new Set(),
    /** 초대별 오류 메시지. 실패를 성공으로 위장하지 않는다. */
    inviteErrors: {},
    /** 발송 중인 대상 uuid들과 발송 결과(대기방 화면이 소비한다). */
    sendingReceiverIds: new Set(),
    sendErrors: {},
});

const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});

export const useGameInviteStore = create((set, get) => ({
    ...initialState(),

    /** 인증 계정을 현재 값으로 맞춘다. 달라지면 초대·커서·표식을 전부 버린다. */
    syncAccount: () => {
        const next = readAuthAccountId();
        const state = get();
        if (state.accountId === next) return state.accountGeneration;
        const accountGeneration = state.accountGeneration + 1;
        set({ accountId: next, accountGeneration, ...initialAccountState() });
        return accountGeneration;
    },

    isCurrent: (accountGeneration) => get().accountGeneration === accountGeneration,

    /**
     * 재접속으로 새 소켓이 생겼다 — 다음 복원이 끝날 때까지 들어오는 사건을 복원으로
     * 취급한다. 이미 받은 목록·커서·소리 표식은 그대로 둔다(같은 계정이므로 과거 사건이
     * 다시 울려서는 안 된다).
     */
    beginResync: () => set({ snapshotLoaded: false, restorePending: true, liveBuffer: [] }),

    /**
     * 서버 snapshot을 복원한다(AC-07).
     *
     * 복원 결과로는 **소리를 내지 않는다**. 커서를 갱신하고, 버퍼에 쌓여 있던 사건을
     * 그 커서로 다시 판정한다 — 커서 이후의 진짜 신규 사건만 소리 후보로 남는다.
     */
    loadSnapshot: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };

        set({ status: "loading", error: null, restorePending: true });

        let data;
        try {
            data = await fetchGameInviteSnapshot();
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 실패를 빈 목록으로 위장하지 않는다. restorePending은 **내리지 않는다** —
            // 실패한 조회는 "이 사건이 과거의 것인지"를 알려주지 못하므로, 그 뒤에 도착한
            // 사건을 최초 발생으로 인정할 근거가 없다.
            set({ status: "error", error: error?.message ?? "초대를 불러오지 못했습니다." });
            return { ok: false, reason: "error" };
        }

        if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };

        const rows = Array.isArray(data?.invites) ? data.invites.filter(isUsableInvite) : [];
        const cursor = typeof data?.cursor === "string" && /^\d+$/.test(data.cursor) ? data.cursor : "0";
        const state = get();

        // snapshot에 담긴 초대는 전부 "이미 알고 있던 것"이다 — 소리 표식을 소모해 둔다.
        const soundConsumed = new Set(state.soundConsumed);
        for (const row of rows) soundConsumed.add(row.inviteId);

        const buffered = state.liveBuffer.filter(isUsableInvite);
        // 커서 **이하**의 버퍼 사건도 과거다(복원이 이미 알고 있는 범위).
        for (const row of buffered) {
            if (compareCreationSeq(row.creationSeq, cursor) <= 0) soundConsumed.add(row.inviteId);
        }

        set({
            invites: mergeInvites(state.invites, [...rows, ...buffered]),
            cursor,
            soundConsumed,
            liveBuffer: [],
            snapshotLoaded: true,
            restorePending: false,
            status: "success",
            error: null,
        });
        return { ok: true, count: rows.length, cursor };
    },

    /**
     * live로 도착한 초대 상태 하나를 반영한다.
     *
     * **소리를 소모하지 않는다.** 소리 적격성은 호출자가 consumeInviteSound로 따로 묻는다 —
     * 그래야 notification_created와 game_invite_received가 어느 순서로 와도 최초 후보가
     * 한 번만 인정된다.
     */
    receiveLiveInvite: (accountId, invite) => {
        const state = get();
        if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" };
        if (!isUsableInvite(invite)) return { applied: false, reason: "invalid" };
        // 서버 emitToUser가 이미 대상을 제한하지만, 계정 전환 직후 도착한 늦은 사건을 막는
        // 이중 방어다.
        if (invite.receiverId !== accountId) return { applied: false, reason: "receiver-mismatch" };

        if (!state.snapshotLoaded) {
            set({ liveBuffer: [...state.liveBuffer, invite] });
            return { applied: false, reason: "buffered" };
        }

        set({ invites: mergeInvites(state.invites, [invite]) });
        return { applied: true };
    },

    /**
     * 이 초대의 소리를 지금 처음 처리하는가(A-06).
     *
     * 다음을 **전부** 만족해야 후보다:
     *   - 현재 인증 계정이 이 초대의 수신자다
     *   - 생성 순번이 서버 커서보다 **크다**(복원·조회·재접속으로 온 과거가 아니다)
     *   - 복원이 해소된 상태다(보류 중에는 판정을 미룬다 — 표식도 소모하지 않는다)
     *   - 최신 상태가 PENDING이고 아직 만료되지 않았다
     *   - 같은 inviteId로 아직 소모하지 않았다
     *
     * true를 돌려주는 순간 표식을 **소모**한다(off·mute여도 마찬가지).
     */
    consumeInviteSound: (accountId, invite, now = Date.now()) => {
        get().syncAccount();
        const state = get();
        if (accountId === null || accountId !== state.accountId) return false;
        if (!isUsableInvite(invite)) return false;
        if (invite.receiverId !== accountId) return false;
        if (state.soundConsumed.has(invite.inviteId)) return false;
        // 복원이 아직 해소되지 않았으면 보류한다. 표식을 소모하지 않으므로, 복원이 실제로
        // 그 사건을 담고 있으면 무음으로 확정되고 아니면 이후 live가 다시 후보가 된다.
        if (!state.snapshotLoaded || state.restorePending) return false;
        if (compareCreationSeq(invite.creationSeq, state.cursor) <= 0) return false;

        // 최신으로 알고 있는 상태가 이미 종료됐으면 소리 후보가 아니다 — 지연 도착한
        // 생성 사건이 terminal 상태를 되살리지 못한다.
        const latest = state.invites.find((item) => item.inviteId === invite.inviteId);
        const effective = latest !== undefined && latest.revision > invite.revision ? latest : invite;
        if (effective.status !== "PENDING") return false;
        const expiresAt = Date.parse(effective.expiresAt ?? "");
        if (Number.isFinite(expiresAt) && expiresAt <= now) return false;

        const soundConsumed = new Set(state.soundConsumed);
        soundConsumed.add(invite.inviteId);
        set({ soundConsumed });
        return true;
    },

    /** 초대를 거절한다. 서버가 확정한 행만 반영한다. */
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

    /**
     * 대기방에서 친구에게 초대를 보낸다(AC-06).
     *
     * creationKey는 이 호출을 식별하는 멱등 키다 — 응답이 유실돼 재시도해도 서버는 같은
     * 초대를 돌려주고 새 수신 사건을 발행하지 않는다. 방 정보는 싣지 않는다(서버가 registry에서
     * 확정한다).
     */
    sendInvite: async (receiverId, creationKey) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        if (get().sendingReceiverIds.has(receiverId)) return { ok: false, reason: "in-progress" };

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

        try {
            const invite = await createGameInviteApi(receiverId, creationKey);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearSending();
            return { ok: true, invite };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearSending();
            set((state) => ({
                sendErrors: { ...state.sendErrors, [receiverId]: error?.message ?? "초대를 보내지 못했습니다." },
            }));
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    /** 수락 시도의 진행 표시. 실제 수락은 소켓 경계가 소유한다. */
    markAcceptPending: (inviteId, pending) => set((state) => {
        const next = new Set(state.pendingInviteIds);
        if (pending) next.add(inviteId); else next.delete(inviteId);
        return { pendingInviteIds: next };
    }),

    setInviteError: (inviteId, message) => set((state) => ({
        inviteErrors: message === null
            ? Object.fromEntries(Object.entries(state.inviteErrors).filter(([id]) => id !== inviteId))
            : { ...state.inviteErrors, [inviteId]: message },
    })),

    reset: () => set(initialAccountState()),
    __resetForTests: () => set(initialState()),
}));

/** 화면에 보여줄 "아직 처리할 수 있는" 초대만 고른다(만료는 서버가 확정하지만 표시도 맞춘다). */
export function selectPendingInvites(invites, now = Date.now()) {
    return invites.filter((invite) => {
        if (invite.status !== "PENDING") return false;
        const expiresAt = Date.parse(invite.expiresAt ?? "");
        return !Number.isFinite(expiresAt) || expiresAt > now;
    });
}
