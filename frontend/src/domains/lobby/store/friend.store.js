import { create } from "zustand";
// node --test는 @/ alias를 풀지 못하므로 단위 테스트가 닿는 경계는 상대 경로로 둡니다.
import {
    blockUserApi,
    fetchBlockedUsers,
    fetchFavoriteFriendIds,
    fetchIncomingRequests as fetchIncomingRequestsApi,
    fetchMyFriends,
    setFriendFavoriteApi,
    unblockUserApi,
} from "../api/friend.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

/**
 * 현재 로그인 계정. 로그인 boolean만 남아 있고 uuid가 없으면 계정이 없는 것으로 봅니다.
 * (notifications.store.js의 readAuthAccountId와 같은 판정입니다.)
 */
function readAuthAccountId() {
    const auth = useAuthStore.getState();
    return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
        ? auth.user.uuid
        : null;
}

/**
 * 같은 계정 안에서도 "누가 더 최신인가"를 가르는 단조 증가 순번입니다(A-01/A-03).
 *
 * 계정 세대(accountGeneration)는 **계정이 바뀐 것**만 잡습니다. 같은 계정에서 조회가 겹치면
 * 세대는 똑같으므로, 먼저 시작한 조회가 늦게 끝나 나중 결과를 덮어쓸 수 있었습니다.
 *
 * 규칙은 하나입니다:
 *   - 조회는 **시작할 때** 번호를 받는다.
 *   - 서버가 확정한 변경은 **응답을 확인한 뒤에** 번호를 받는다.
 *
 * 그래서 조회보다 나중에 확정된 변경은 언제나 더 큰 번호를 갖고, 그 조회가 뒤늦게 도착해도
 * 확정 값을 덮지 못합니다. 예: fetchFavorites 시작(1) → setFavorite 커밋(2) →
 * fetchFavorites 도착(1 < 2) ⇒ 오래된 목록은 버려지고 서버 확정 별 상태가 남습니다.
 */
let writeSeq = 0;
const nextSeq = () => (writeSeq += 1);

/**
 * 비동기 작업 하나를 식별하는 소유 표식(A-02).
 *
 * 계정 세대만으로는 부족합니다. A → B → A로 계정이 오간 사이에 **첫 A**에서 시작한 수락
 * 응답이 도착하면, 그 완료의 `finally`가 지금 진행 중인 **두 번째 A**의 잠금을 풀어 버려
 * 같은 요청에 두 번째 처리가 나갈 수 있습니다. 잠금에 "누가 잠갔는가"를 함께 기록해 두면
 * 옛 완료의 해제가 그대로 무시됩니다.
 */
let operationSeq = 0;
const nextOperationId = () => (operationSeq += 1);

/** 전체 수락 집계의 초기값. 계정에 묶이므로 계정이 바뀌면 함께 사라집니다. */
export const emptyAcceptAllResult = () => ({
    running: false,
    accepted: 0,
    failed: 0,
    unconfirmed: 0,
    refreshError: null,
    completedAt: null,
});

/** 계정이 바뀔 때 통째로 버리는 값들. 계정에 묶이지 않은 값은 여기 두지 않습니다. */
const initialAccountState = () => ({
    // 내 친구 목록입니다.
    friends: [],

    // 나에게 들어온 친구 요청 목록입니다.
    incomingRequests: [],

    // 내가 이미 친구 요청을 보낸 사용자 id 목록입니다.
    // Set을 쓰면 "이미 보냈는지"를 빠르게 확인할 수 있습니다.
    sentRequestIds: new Set(),

    // 요청을 수락/거절해서 화면에서 처리 완료된 요청 id 목록입니다.
    resolvedRequestIds: new Set(),

    // F-19(AC-03): 서버가 소유한 계정별 즐겨찾기입니다. 로그아웃·계정 전환 시 여기서
    // 통째로 비워지므로 이전 계정의 별 표시가 다음 계정 화면에 남지 않습니다.
    favoriteFriendIds: new Set(),

    // 즐겨찾기 저장이 진행 중인 친구 id들. 서버가 확정하기 전에는 별 상태를 바꾸지 않습니다.
    favoritePendingIds: new Set(),

    // 즐겨찾기 저장 실패(friendId → 메시지). 실패를 성공으로 위장하지 않습니다.
    favoriteErrors: {},

    // F-19(AC-04): 내가 차단한 사용자 목록입니다.
    blockedUsers: [],
    blocksStatus: "idle", // idle | loading | success | error
    blocksError: null,

    // 조회 실패는 삼키지 않고 화면이 재시도를 제공할 수 있게 남깁니다(AC-02).
    friendsError: null,
    incomingError: null,
    favoritesError: null,

    // F-19(AC-02): 요청 단위 처리 잠금은 **계정 상태**입니다.
    //
    // 예전에는 useFriendListSync의 useRef/useState였습니다. 그러면 같은 계정에서도 패널이
    // 언마운트·리마운트될 때(로비 → 대기방 이동, 탭 교체) 잠금이 사라져 이미 처리 중인
    // 요청을 새 화면이 다시 처리할 수 있었습니다. 공용 store로 옮기면 두 화면이 같은
    // 집합을 보고, 계정이 바뀌면 여기 있는 모든 잠금이 한 번에 정리됩니다.
    processingRequestIds: new Set(),

    // 그 잠금을 **누가** 잡았는가(requestId → 작업 번호). 옛 계정에서 시작한 완료가
    // 새 작업의 잠금을 풀지 못하게 하는 소유 대조입니다.
    requestLockOwners: {},

    // 전체 수락 집계도 계정에 묶습니다 — 계정을 바꾸면 이전 계정의 집계가 남지 않습니다.
    acceptAllResult: emptyAcceptAllResult(),

    // 목록별 "지금 반영돼 있는 값의 순번". 이보다 작은 번호의 결과는 버립니다.
    appliedSeq: { friends: 0, incoming: 0, favorites: 0, blocks: 0 },

    /**
     * 그 순번을 차지한 결과가 **성공이었는가**(목록별).
     *
     * 순번만으로는 부족합니다. 예전에는 claimSeq가 실패하면 무조건 `{ok:true,superseded:true}`를
     * 돌려줬는데, 더 최신 요청도 **실패**했다면 지금 화면에는 최신 목록이 없습니다. 그런데도
     * 오래된 요청이 성공을 보고해 전체 수락의 "재조회 실패" 안내가 사라졌습니다(CODEX-2).
     *
     * 그래서 순번을 차지할 때 그 결과가 성공인지 함께 기록하고, 밀려난 호출은 **그때의 최신
     * 사실**을 그대로 돌려줍니다. null은 "아직 아무 결과도 반영된 적 없음"입니다.
     */
    appliedResult: { friends: null, incoming: null, favorites: null, blocks: null },
});

const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});

// 로비 친구 목록과 친구 요청 상태를 전역에서 관리하는 store입니다.
export const useFriendStore = create((set, get) => ({
    ...initialState(),

    /**
     * 인증 계정을 현재 값으로 맞춥니다(A-02).
     *
     * 계정이 조금이라도 달라지면(로그아웃 · A→B 직접 전환 모두) 친구·요청·보낸/처리된 요청·
     * 즐겨찾기·차단을 **전부** 버리고 세대를 올립니다. 진행 중이던 조회·저장은 완료 지점에서
     * 세대를 비교해 스스로 무효가 됩니다 — A의 지연 응답이 B의 화면에 반영되지 않습니다.
     */
    syncAccount: () => {
        const next = readAuthAccountId();
        const state = get();
        if (state.accountId === next) return state.accountGeneration;

        const accountGeneration = state.accountGeneration + 1;
        set({ accountId: next, accountGeneration, ...initialAccountState() });
        return accountGeneration;
    },

    /** 이 비동기 결과가 아직 유효한가(계정이 그대로인가). */
    isCurrent: (accountGeneration) => get().accountGeneration === accountGeneration,

    /**
     * 이 번호가 해당 목록의 최신인가. 맞으면 그 번호를 "반영된 값"으로 기록합니다.
     *
     * false면 더 최신의 조회나 서버 확정 변경이 이미 반영돼 있다는 뜻이라, 호출자는 아무것도
     * 쓰지 않고 물러나야 합니다(오류 표시도 쓰지 않습니다 — 더 최신 결과가 성공이었다면
     * 오래된 실패로 그것을 덮으면 안 됩니다).
     */
    claimSeq: (key, ticket, outcome = { ok: true }) => {
        if (get().appliedSeq[key] >= ticket) return false;
        set((state) => ({
            appliedSeq: { ...state.appliedSeq, [key]: ticket },
            appliedResult: { ...state.appliedResult, [key]: outcome },
        }));
        return true;
    },

    /**
     * 밀려난(superseded) 호출이 돌려줄 **현재의 사실**.
     *
     * 더 최신 결과가 성공이었으면 목록은 최신이므로 성공으로 알립니다. 더 최신 결과도
     * 실패였으면 그 실패를 그대로 전달합니다 — 오래된 호출의 성공 보고가 "지금 목록이
     * 최신이다"라는 잘못된 안내로 바뀌지 않게 합니다.
     */
    supersededResult: (key) => {
        const applied = get().appliedResult[key];
        if (applied === null || applied === undefined) {
            return { ok: false, reason: "superseded-unknown", superseded: true };
        }
        return applied.ok
            ? { ok: true, superseded: true }
            : { ok: false, reason: "superseded-error", superseded: true, message: applied.message };
    },

    /** 서버가 확정한 변경을 반영하면서 그 목록의 순번을 최신으로 올립니다. */
    bumpSeq: (key) => {
        const ticket = nextSeq();
        set((state) => ({
            appliedSeq: { ...state.appliedSeq, [key]: ticket },
            // 서버가 확정한 변경이라 이 시점의 목록 상태는 최신입니다.
            appliedResult: { ...state.appliedResult, [key]: { ok: true } },
        }));
        return ticket;
    },

    // 서버에서 내 친구 목록을 가져와 store에 저장합니다.
    // 오류를 삼키지 않고 명시적인 성공/실패를 돌려줍니다 — 호출부(전체 수락 등)가
    // "재조회까지 성공했는가"를 구분해 안내해야 하기 때문입니다(AC-02).
    fetchFriends: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const friendsData = await fetchMyFriends();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 더 최신 조회·확정 변경이 이미 반영됐으면 덮지 않습니다. 그때는 **그 최신
            // 결과가 성공이었는지**를 그대로 전달합니다(성공으로 단정하지 않습니다).
            if (!get().claimSeq("friends", ticket, { ok: true })) return get().supersededResult("friends");
            set({ friends: friendsData, friendsError: null });
            return { ok: true, friends: friendsData };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "친구 목록을 불러오지 못했습니다.";
            if (!get().claimSeq("friends", ticket, { ok: false, message })) return get().supersededResult("friends");
            set({ friendsError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    // 서버에서 나에게 들어온 친구 요청 목록을 가져와 store에 저장합니다.
    fetchIncomingRequests: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const requests = await fetchIncomingRequestsApi();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("incoming", ticket, { ok: true })) return get().supersededResult("incoming");
            set({ incomingRequests: requests, incomingError: null });
            return { ok: true, requests };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "받은 친구 신청을 불러오지 못했습니다.";
            if (!get().claimSeq("incoming", ticket, { ok: false, message })) return get().supersededResult("incoming");
            set({ incomingError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    // F-19(AC-03): 서버에 저장된 즐겨찾기를 복원합니다.
    fetchFavorites: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const ids = await fetchFavoriteFriendIds();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 이 조회보다 **나중에** 서버가 확정한 setFavorite이 있으면 그 값을 지키고
            // 오래된 목록은 버립니다 — 별 표시가 잠깐 예전 값으로 되돌아가지 않습니다.
            if (!get().claimSeq("favorites", ticket, { ok: true })) return get().supersededResult("favorites");
            set({ favoriteFriendIds: new Set(Array.isArray(ids) ? ids : []), favoritesError: null });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "즐겨찾기를 불러오지 못했습니다.";
            if (!get().claimSeq("favorites", ticket, { ok: false, message })) return get().supersededResult("favorites");
            set({ favoritesError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    /**
     * 즐겨찾기를 서버에 저장합니다(AC-03).
     *
     * **원하는 값을 그대로 보냅니다** — toggle 명령이 아니라서 응답 유실 후 재전송이 상태를
     * 뒤집지 않습니다. 서버가 확정하기 전에는 별 상태를 바꾸지 않고, 실패하면 오류만 남기고
     * 이전 값을 유지합니다(저장 완료로 위장하지 않습니다).
     */
    setFavorite: async (friendId, desired) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };

        set((state) => ({
            favoritePendingIds: new Set(state.favoritePendingIds).add(friendId),
            favoriteErrors: Object.fromEntries(
                Object.entries(state.favoriteErrors).filter(([id]) => id !== friendId),
            ),
        }));

        const clearPending = () => set((state) => {
            const next = new Set(state.favoritePendingIds);
            next.delete(friendId);
            return { favoritePendingIds: next };
        });

        try {
            const result = await setFriendFavoriteApi(friendId, desired);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            // 서버가 확정한 값만 반영합니다(요청한 값이 아니라).
            const confirmed = result?.favorite === true;
            // 커밋을 **확인한 뒤에** 순번을 받습니다 — 이 저장보다 먼저 시작한 조회는 모두
            // 더 작은 번호라서, 나중에 도착해도 이 확정 값을 덮지 못합니다(A-03).
            get().bumpSeq("favorites");
            set((state) => {
                const next = new Set(state.favoriteFriendIds);
                if (confirmed) next.add(friendId); else next.delete(friendId);
                return { favoriteFriendIds: next };
            });
            return { ok: true, favorite: confirmed };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            set((state) => ({
                favoriteErrors: {
                    ...state.favoriteErrors,
                    [friendId]: error?.message ?? "즐겨찾기를 저장하지 못했습니다.",
                },
            }));
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    // F-19(AC-04): 차단 목록·차단·해제.
    fetchBlocks: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        set({ blocksStatus: "loading", blocksError: null });
        try {
            const blocks = await fetchBlockedUsers();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("blocks", ticket, { ok: true })) return get().supersededResult("blocks");
            set({ blockedUsers: Array.isArray(blocks) ? blocks : [], blocksStatus: "success", blocksError: null });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "차단 목록을 불러오지 못했습니다.";
            if (!get().claimSeq("blocks", ticket, { ok: false, message })) return get().supersededResult("blocks");
            set({ blocksStatus: "error", blocksError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    blockUser: async (targetId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            await blockUserApi(targetId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 차단은 친구 목록·받은 요청·차단 목록을 모두 바꾼다 — 서버에서 다시 읽는다.
            await Promise.all([get().fetchFriends(), get().fetchIncomingRequests(), get().fetchBlocks()]);
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            return { ok: false, reason: "error", message: error?.message ?? "차단하지 못했습니다." };
        }
    },

    unblockUser: async (targetId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            await unblockUserApi(targetId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 해제는 친구 관계를 되살리지만(목록에 다시 보인다) 과거 요청·초대를 되살리지는
            // 않는다 — 그 판정은 전부 서버가 하고 여기서는 다시 읽기만 한다.
            await Promise.all([get().fetchFriends(), get().fetchBlocks()]);
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            return { ok: false, reason: "error", message: error?.message ?? "차단을 해제하지 못했습니다." };
        }
    },

    // 수락/거절한 친구 요청을 받은 요청 목록에서 제거합니다.
    // 서버가 확정한 처리의 결과이므로 순번을 올립니다 — 이 제거보다 먼저 시작한 조회가
    // 뒤늦게 도착해 처리된 요청을 다시 살려 놓지 않습니다.
    removeIncomingRequest: (requestId) => {
        get().bumpSeq("incoming");
        set((state) => ({
            incomingRequests: state.incomingRequests.filter((request) => request.request_id !== requestId),
        }));
    },

    // 소켓 이벤트나 API 응답으로 받은 요청 목록을 통째로 교체합니다.
    setIncomingRequests: (requests) => {
        get().bumpSeq("incoming");
        set({ incomingRequests: requests });
    },

    /**
     * F-19(AC-02): 요청 단위 처리 잠금을 취득합니다.
     *
     * 이미 잠긴 id는 돌려주지 않으므로, 전체 수락과 단건 연타가 같은 요청을 두 번 처리하지
     * 않습니다. 읽기와 쓰기가 같은 동기 구간에 있어 두 호출이 끼어들 수 없습니다.
     *
     * @param {Array} ids   잠글 요청 id들
     * @param {number} [owner] 이 잠금의 소유 표식(beginOperation). 주면 그 작업만 풀 수 있습니다.
     * @returns {Array} 이번 호출이 **새로 잠근** id들. 빈 배열이면 아무것도 하면 안 됩니다.
     */
    lockRequests: (ids, owner = undefined) => {
        get().syncAccount();
        const state = get();
        const fresh = ids.filter((id) => !state.processingRequestIds.has(id));
        if (fresh.length === 0) return [];
        const next = new Set(state.processingRequestIds);
        for (const id of fresh) next.add(id);
        if (owner === undefined) {
            set({ processingRequestIds: next });
            return fresh;
        }
        const owners = { ...state.requestLockOwners };
        for (const id of fresh) owners[id] = owner;
        set({ processingRequestIds: next, requestLockOwners: owners });
        return fresh;
    },

    /** 이 작업 하나를 식별하는 번호를 발급합니다. */
    beginOperation: () => nextOperationId(),

    /**
     * 잠금을 풉니다. 계정이 바뀌어 이미 비워졌다면 아무 일도 하지 않습니다.
     *
     * owner를 주면 **자기가 잡은 잠금만** 풉니다. A → B → A 사이에 도착한 옛 응답이
     * 같은 요청 id로 진행 중인 새 작업의 잠금을 풀어 중복 처리를 열지 않게 합니다.
     */
    unlockRequests: (ids, owner = undefined) => set((state) => {
        const next = new Set(state.processingRequestIds);
        const owners = { ...state.requestLockOwners };
        for (const id of ids) {
            if (owner !== undefined && owners[id] !== owner) continue;
            next.delete(id);
            delete owners[id];
        }
        return { processingRequestIds: next, requestLockOwners: owners };
    }),

    setAcceptAllResult: (result) => set({ acceptAllResult: result }),

    // 특정 사용자에게 친구 요청을 보냈다고 표시합니다.
    addSentRequest: (uuid) => set((state) => ({
        // Zustand가 변경을 감지할 수 있게 기존 Set을 직접 수정하지 않고 새 Set을 만듭니다.
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    // 친구 요청이 처리된 사용자 id를 보낸 요청 목록에서 제거하고 처리 완료 목록에 넣습니다.
    removeSentRequest: (uuid) => set((state) => {
        const nextSent = new Set(state.sentRequestIds);
        nextSent.delete(uuid);

        const nextResolved = new Set(state.resolvedRequestIds).add(uuid);

        return { sentRequestIds: nextSent, resolvedRequestIds: nextResolved };
    }),

    // 처리 완료 표시를 초기화합니다.
    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),

    // 소켓으로 친구 접속 상태가 바뀌었을 때 친구 목록 안의 상태를 갱신합니다.
    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== "OFFLINE" }
                : friend
        ),
    })),

    reset: () => set(initialAccountState()),

    /** 시험 전용 — 계정 정보까지 포함해 완전히 초기화합니다. */
    __resetForTests: () => set(initialState()),
}));
