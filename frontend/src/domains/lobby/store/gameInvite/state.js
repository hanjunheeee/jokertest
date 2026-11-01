// 게임 초대 스토어의 처음 상태와 모듈 번호표
// gameInvite.store.js와 액션 파일들이 씀

// 보내기 키에 붙일 짧은 생애 id (탭마다 다르게 해서 키 충돌 막기)
let lifecycleCounter = 0;
function newLifecycleId() {
    lifecycleCounter += 1;
    const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
    return `${lifecycleCounter.toString(36)}${random}`.slice(0, 12);
}

// 수락 작업 번호: 늦게 끝난 옛 수락이 새 수락의 잠금을 풀지 못하게 함
let operationCounter = 0;
export const nextOperationId = () => (operationCounter += 1);

// 스냅샷 요청 번호: 늦게 온 옛 응답을 가려냄
let snapshotSeqCounter = 0;
export const nextSnapshotSeq = () => (snapshotSeqCounter += 1);

// 계정마다 새로 시작하는 상태
export const initialAccountState = () => ({
    status: "idle",
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

    sendLifecycleId: newLifecycleId(),
});

// 스토어 처음 상태 (계정 칸 + 계정별 상태)
export const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});
