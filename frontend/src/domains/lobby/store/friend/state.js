// 친구 스토어의 처음 상태와 모듈 번호표
// friend.store.js와 액션 파일들, 전부 수락 흐름(friendSync/acceptAll)이 씀

// 쓰기·응답 번호표: 응답이 그보다 늦은 로컬 변경을 덮지 못하게 함
let writeSeq = 0;
export const nextSeq = () => (writeSeq += 1);

// 받은 신청 처리 작업 번호: 옛 작업이 새 작업의 잠금을 풀지 못하게 함
let operationSeq = 0;
export const nextOperationId = () => (operationSeq += 1);

// 전체 수락 결과 빈 값
export const emptyAcceptAllResult = () => ({
    running: false,
    accepted: 0,
    failed: 0,
    unconfirmed: 0,
    refreshError: null,
    completedAt: null,
});

// 계정마다 새로 시작하는 상태
export const initialAccountState = () => ({
    friends: [],

    incomingRequests: [],

    sentRequestIds: new Set(),

    resolvedRequestIds: new Set(),

    favoriteFriendIds: new Set(),

    favoritePendingIds: new Set(),

    favoriteErrors: {},

    favoriteWrites: {},

    incomingRemovals: {},

    blockedUsers: [],
    blocksStatus: "idle",
    blocksError: null,

    friendsError: null,
    incomingError: null,
    favoritesError: null,

    processingRequestIds: new Set(),

    requestLockOwners: {},

    acceptAllResult: emptyAcceptAllResult(),

    appliedSeq: { friends: 0, incoming: 0, favorites: 0, blocks: 0 },

    appliedResult: { friends: null, incoming: null, favorites: null, blocks: null },
});

// 스토어 처음 상태 (계정 칸 + 계정별 상태)
export const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});
