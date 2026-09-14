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
 * snapshot에 없는 행을 계속 "처리 가능"으로 둘 근거가 있는가(AC-05).
 *
 * getReceiverSnapshot은 **PENDING만** 돌려준다. 즉 snapshot은 "지금 처리할 수 있는 초대의
 * 전부"다. 예전에는 단순 병합이라, 차단·거절·만료로 취소된 초대가 이전 목록에 PENDING으로
 * 남아 수락 버튼과 함께 계속 보였다(유령 초대).
 *
 * 남길 근거는 셋 중 하나다:
 *   1) snapshot이 그 초대를 들고 있다 — 최신 값으로 병합하면 된다.
 *   2) 우리가 아는 상태가 이미 종료다 — 처리 가능하지 않으니 이력으로 보존한다.
 *   3) 순번이 커서보다 크다 — 이 조회가 읽은 경계 **이후에** 생긴 초대라 snapshot이 알 수
 *      없다. 없앨 근거가 아니다(A-09: 커서 이하 행은 뒤늦게 커밋되지 않는다).
 */
export function survivesSnapshot(invite, snapshotIds, cursor) {
    if (snapshotIds.has(invite.inviteId)) return true;
    if (invite.status !== "PENDING") return true;
    return compareCreationSeq(invite.creationSeq, cursor) > 0;
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

/**
 * 이 계정 상태(store lifecycle) 하나를 식별하는 짧은 표식.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────────
 * 발송 멱등 키의 번호(sendKeys)는 계정 상태에 들어 있어 로그아웃·계정 전환·새로고침이면
 * 통째로 1로 되돌아간다. 그런데 서버에 저장된 creation_key는 그대로 남는다. 그래서
 * 범위와 번호만으로 키를 만들면:
 *
 *   A로 초대 발송(키 `room:friend:1`) → 상대가 거절해 종료 → 로그아웃/새로고침 →
 *   다시 A로 로그인 → **새로운 의도적인 초대**가 또 `room:friend:1`로 나간다 →
 *   서버는 "같은 키의 재시도"로 보고 끝난 옛 행을 그대로 돌려준다 → 아무 일도 안 일어난다.
 *
 * lifecycle 표식을 키에 넣으면 그 충돌이 사라진다. 표식은 계정 상태가 만들어질 때 **한 번**
 * 정해지므로, 결과를 확정하지 못한 재시도는 여전히 **정확히 같은 키**로 나간다(같은
 * lifecycle·같은 번호). 네트워크 시도마다 난수를 새로 뽑는 것과는 다르다.
 *
 * 새로고침 도중에 결과가 불확실해진 발송은 이 표식이 바뀌므로 키가 달라진다. 그 경우는
 * 서버의 live-PENDING 중복 방지(createInvite)가 같은 발송자·같은 방 인스턴스로 살아 있는
 * 초대를 그대로 돌려주며 막는다 — 어차피 새로고침 뒤에는 "재시도 중"이라는 사실 자체가
 * 메모리에 남지 않는다.
 *
 * 길이 예산: creation_key는 서버에서 120자 제한이다. 범위(방 uuid 36 + ':' + 계정 uuid 36)
 * 73자 + ':' + 표식 최대 12자 + ':' + 번호까지 90자 안쪽이다.
 */
let lifecycleCounter = 0;
function newSendLifecycleId() {
    lifecycleCounter += 1;
    // 카운터만으로는 새로고침을 구분하지 못하고(모듈이 다시 로드되며 0으로 돌아간다),
    // 난수만으로는 같은 밀리초의 연속 생성을 보장하지 못한다 — 둘을 합친다.
    const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
    return `${lifecycleCounter.toString(36)}${random}`.slice(0, 12);
}

/**
 * 이 오류가 "서버가 이 논리 발송을 확정해서 거부했다"를 증명하는가.
 *
 * 4xx는 서버가 요청을 읽고 판단해 거부했다는 뜻이라 이 논리 발송은 끝났다(특히 409는 그
 * 키가 이미 다른 초대에 쓰였다는 뜻이라 반드시 다음 번호로 넘어가야 한다).
 *
 * 5xx는 다르다 — **정수 status가 있다는 것만으로 쓰기가 커밋되지 않았다고 말할 수 없다.**
 * 커밋 뒤 응답을 만들다가 터졌을 수도 있으므로 결과는 여전히 모름이고, 같은 키를 유지해
 * 재시도가 멱등하게 나가도록 한다. 408·425·429는 4xx지만 "처리하지 않았다"가 아니라
 * "다시 오라"는 뜻이라 같이 보류한다.
 */
export function establishesTerminalRefusal(status) {
    if (!Number.isInteger(status)) return false;
    if (status === 408 || status === 425 || status === 429) return false;
    return status >= 400 && status < 500;
}

/** 비동기 완료가 "자기가 시작한 일"인지 대조하는 소유 표식. */
let operationCounter = 0;
const nextOperationId = () => (operationCounter += 1);

/** snapshot 응답의 도착 순서를 가르는 단조 증가 순번(조회 **시작** 시점에 발급한다). */
let snapshotSeqCounter = 0;
const nextSnapshotSeq = () => (snapshotSeqCounter += 1);

/**
 * 이 PENDING 행을 지금 처리 가능한 것으로 인정할 근거가 있는가(AC-05).
 *
 * 해소된 snapshot이 담고 있었으면 근거가 있다. 커서보다 **뒤에** 생긴 행이면 그 조회가
 * 알 수 없었던 것이므로 역시 인정한다. 둘 다 아니면 — 커서 이하인데 snapshot에 없었다면 —
 * 서버가 이미 종료시킨 행이다. 지연 도착한 생성 사건이 그것을 되살리지 못하게 막는다.
 *
 * 종료 상태(거절·만료·취소) 갱신은 이 판정을 거치지 않는다 — 이력은 계속 최신으로 맞춘다.
 */
export function isActionablePending(invite, snapshotPendingIds, cursor, snapshotLoaded) {
    if (invite.status !== "PENDING") return true;
    if (!snapshotLoaded) return true;
    if (snapshotPendingIds.has(invite.inviteId)) return true;
    return compareCreationSeq(invite.creationSeq, cursor) > 0;
}

/**
 * 이 초대가 지금 소리 후보인가 — **그리고 아니라면 왜 아닌가**(읽기 전용).
 *
 * consumeInviteSound가 실제로 쓰는 판정이 여기 한 곳에 있다. 사유 문자열을 따로 내보내는
 * 이유는 AC-07의 증거 때문이다: 운영자가 실제 Chrome에서 "왜 소리가 나지 않았는가"를
 * 확인하려면 억제 사유가 화면에 보여야 하는데, 판정 로직을 진단 쪽에 복제하면 둘이
 * 어긋나는 순간 증거가 거짓이 된다. 이 함수는 상태를 **바꾸지 않는다** — 표식 소모는
 * consumeInviteSound만 한다.
 *
 * @returns {{ eligible: boolean, reason: string|null }}
 */
export function evaluateInviteSound(state, accountId, invite, now = Date.now()) {
    if (accountId === null || accountId !== state.accountId) return { eligible: false, reason: "account-mismatch" };
    if (!isUsableInvite(invite)) return { eligible: false, reason: "invalid-invite" };
    if (invite.receiverId !== accountId) return { eligible: false, reason: "receiver-mismatch" };
    if (state.soundConsumed.has(invite.inviteId)) return { eligible: false, reason: "already-consumed" };
    // 복원이 아직 해소되지 않았으면 보류한다. 표식을 소모하지 않으므로, 복원이 실제로
    // 그 사건을 담고 있으면 무음으로 확정되고 아니면 이후 live가 다시 후보가 된다.
    if (!state.snapshotLoaded || state.restorePending) return { eligible: false, reason: "restore-pending" };
    if (compareCreationSeq(invite.creationSeq, state.cursor) <= 0) {
        return { eligible: false, reason: "at-or-below-cursor" };
    }

    // 최신으로 알고 있는 상태가 이미 종료됐으면 소리 후보가 아니다 — 지연 도착한
    // 생성 사건이 terminal 상태를 되살리지 못한다.
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
    /** 서버에서 받은 + live로 받은 초대들(종료된 것도 상태 표시를 위해 남긴다). */
    invites: [],
    /** 종료 초대까지 포함한 수신자 전체 최대 생성 순번. 이 값 이하 사건은 전부 무음이다. */
    cursor: "0",
    /**
     * 해소된 snapshot이 **처리 가능**이라고 확인해 준 inviteId들(AC-05).
     *
     * getReceiverSnapshot은 PENDING만 돌려주므로, 이 집합과 cursor를 함께 들고 있으면
     * "커서 이하인데 이 집합에 없는 PENDING"은 서버가 이미 종료시킨 행이라고 단정할 수 있다.
     * 예전에는 loadSnapshot이 그런 행을 목록에서 내리기만 하고 그 사실을 기억하지 않아,
     * 뒤늦게 도착한 지연 PENDING 사건이 receiveLiveInvite를 통해 다시 들어와 취소된 초대가
     * 수락 버튼과 함께 되살아났다(유령 초대).
     */
    snapshotPendingIds: new Set(),
    /** snapshot 응답의 적용 순번. 늦게 도착한 **오래된** 응답이 커서·지식을 되돌리지 못한다. */
    snapshotSeq: 0,
    /** 초기 복원을 마쳤는가. 마치기 전에 온 live는 버퍼에 둔다. */
    snapshotLoaded: false,
    /** 복원이 아직 해소되지 않았는가(실패는 해소가 아니다). */
    restorePending: false,
    /** 복원 전에 도착한 live 사건들. `{ invite, sfxEvent }` — 소리 봉투를 함께 보관한다. */
    liveBuffer: [],
    /** 소리 후보로 이미 소모한 inviteId들. off·mute여도 소모한다. */
    soundConsumed: new Set(),
    /** 처리 중인 inviteId들(수락·거절 중복 클릭 방지). */
    pendingInviteIds: new Set(),
    /**
     * 그 진행 표시를 **누가** 세웠는가(inviteId → 시도 번호).
     *
     * A → B → A로 계정이 오간 사이에 옛 수락 시도의 응답이 도착하면, 소유 대조가 없을 때
     * 그 완료가 지금 진행 중인 새 시도의 표시를 내려 버린다. 그러면 같은 초대에 두 번째
     * 수락이 나갈 수 있다.
     */
    acceptOwners: {},
    /** 초대별 오류 메시지. 실패를 성공으로 위장하지 않는다. */
    inviteErrors: {},
    /** 발송 중인 대상 uuid들과 발송 결과(대기방 화면이 소비한다). */
    sendingReceiverIds: new Set(),
    sendErrors: {},
    /**
     * 논리 발송별 멱등 키 번호(`${roomId}:${receiverId}` → 정수).
     *
     * 같은 번호 = 같은 논리 발송이다. **결과를 확정하지 못한 재시도는 번호를 그대로 두고**,
     * 서버가 결과를 확정한 뒤(성공이든 명시적 거부든)에만 다음 번호로 넘어간다. 그래서
     * 응답 유실 재시도는 두 번째 초대를 만들지 않고, 끝난 초대 뒤의 의도적인 재초대는
     * 막히지 않는다(AC-06).
     *
     * 번호만으로는 부족하다 — 계정 상태가 새로 만들어지면 번호가 1로 돌아가지만 서버의
     * creation_key는 남기 때문이다. 그래서 아래 sendLifecycleId를 키에 함께 넣는다.
     */
    sendKeys: {},

    /** 이 계정 상태 하나를 식별하는 값. 발송 키에 들어가 lifecycle 간 충돌을 없앤다. */
    sendLifecycleId: newSendLifecycleId(),
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

        // 이 조회의 순번은 **시작할 때** 받는다. 다만 시작 순서는 서버가 실제로 읽은 순서를
        // 보장하지 않는다 — 아래에서 커서(서버가 확정한 지식)를 우선 기준으로 쓴다.
        const ticket = nextSnapshotSeq();
        set({ status: "loading", error: null, restorePending: true });

        let data;
        try {
            data = await fetchGameInviteSnapshot();
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 더 새로운 조회가 이미 성공적으로 복원했다면 이 실패는 과거다 — 성공한 화면을
            // 오류로 덮거나 restorePending을 다시 세우지 않는다(RESULT-3).
            if (get().snapshotSeq >= ticket) return { ok: false, reason: "superseded", superseded: true };
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

        // ── 어느 응답이 "더 최신 서버 지식"인가 (RESULT-3) ──────────────────
        //
        // 예전에는 클라이언트의 **요청 시작 순서**(ticket)만으로 판정했다. 그러나 나중에
        // 시작한 요청이 서버에 먼저 도달해 먼저 읽힐 수 있다 — 그 응답의 커서가 더 작다.
        // 그때 시작 순서만 보면:
        //   · 먼저 도착한 늦게-시작 응답이 큰 ticket을 차지하고,
        //   · 뒤이어 도착한 **더 새로운 서버 지식**이 superseded로 버려진다.
        // 그러면 그 사이에 생긴 초대를 목록에서 잃고 커서도 낮은 값에 머문다.
        //
        // 서버가 확정한 지식의 순서는 커서가 말해 준다(A-09: 커서 이하 행은 뒤늦게 커밋되지
        // 않는다). 그래서 커서를 1차 기준으로, 같은 커서일 때만 ticket을 동점 처리에 쓴다.
        const cursorDelta = compareCreationSeq(cursor, state.cursor);
        // beginResync resets snapshotLoaded but preserves confirmed cursor knowledge.
        const knownWorse = cursorDelta < 0;

        // ── 같은 커서는 서버의 읽기 순서를 정하지 못한다 (review5 #6) ─────────
        //
        // 커서가 **다르면** 선후가 정해진다: 커서가 큰 응답은 그 초대가 생긴 뒤에 읽었으므로
        // 반드시 나중이다. 그런데 커서가 **같으면** 어느 쪽이 나중인지 알 수 없다 — 차단·
        // 거절·만료는 커서를 올리지 않기 때문이다.
        //
        // 예전에는 그 동점을 클라이언트의 요청 시작 순번(ticket)으로 갈랐다. 시작 순서는
        // 서버가 읽은 순서가 아니므로, 서버에서 먼저 읽힌 오래된 응답이 더 큰 ticket을 가지면
        // "취소됐다"는 나중 사실이 superseded로 버려지고 유령 초대가 처리 가능 상태로 남았다.
        //
        // 초대의 수명은 단조롭다(PENDING → terminal, 되돌아오지 않는다). 그래서 같은 커서의
        // 어느 조회든 "이 행은 처리 가능 목록에 없다"고 말하면 그것은 확정 사실이고, 두
        // 응답의 처리 가능 집합을 **교집합**으로 합치는 것이 도착 순서와 무관하게 옳다.
        //
        // 첫 복원(snapshotLoaded=false)과 재접속 복원은 비교할 이전 지식이 없으므로 그대로
        // 받는다 — 안 그러면 빈 초기 집합과의 교집합이 정당한 PENDING을 전부 지운다.
        const sameBoundary = cursorDelta === 0 && state.snapshotLoaded;

        // 지식이 뒤처진 응답은 커서·처리 가능 집합을 **되돌리지 않는다**. 그래도 복원 자체는
        // 해소한다 — 안 그러면 restorePending이 영원히 남아 이후 신규 초대가 전부 무음이 된다.
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

        // snapshot에 담긴 초대는 전부 "이미 알고 있던 것"이다 — 소리 표식을 소모해 둔다.
        const soundConsumed = new Set(state.soundConsumed);
        for (const row of rows) soundConsumed.add(row.inviteId);

        const buffered = state.liveBuffer.filter((item) => isUsableInvite(item?.invite));
        // 커서 **이하**의 버퍼 사건도 과거다(복원이 이미 알고 있는 범위).
        for (const item of buffered) {
            if (compareCreationSeq(item.invite.creationSeq, effectiveCursor) <= 0) {
                soundConsumed.add(item.invite.inviteId);
            }
        }

        // 커서 **이후**의 실제 신규 수신은 복원이 아니라 진짜 새 사건이다. 복원 대기 중이라
        // 판정을 미뤄 뒀던 것이므로, 여기서 호출자에게 돌려줘 정확히 한 번 소리 후보로
        // 판정하게 한다(consumeInviteSound가 표식을 소모한다 — 여기서는 소모하지 않는다).
        const soundCandidates = buffered.filter((item) => (
            item.sfxEvent !== null && item.sfxEvent !== undefined
            && compareCreationSeq(item.invite.creationSeq, effectiveCursor) > 0
            && !soundConsumed.has(item.invite.inviteId)
        ));

        // snapshot은 "지금 처리 가능한 초대"의 authoritative한 전부다 — 여기 없는 PENDING은
        // 이미 끝난 것이므로 목록에서 내린다(유령 초대 제거). 지식이 뒤처진 응답은 그 판정을
        // 할 자격이 없으므로 **이미 확정된 집합**으로만 거른다(종료된 행을 되살리지 않으면서
        // 더 새로운 지식이 남긴 행도 잃지 않는다).
        const survives = (invite) => survivesSnapshot(invite, effectivePendingIds, effectiveCursor);
        const retained = state.invites.filter(survives);
        const incoming = knownWorse || sameBoundary
            // 뒤처진 응답의 행은 최신 지식이 인정하는 것만 받아들인다. 같은 커서의 응답도
            // 마찬가지다 — 교집합이 이미 종료됐다고 확정한 행을 그 응답의 목록으로 되살리면
            // 교집합을 계산한 의미가 없다. mergeInvites가 revision 비교를 하므로 오래된
            // PENDING이 최신 terminal을 덮지도 않는다.
            ? rows.filter(survives)
            : rows;
        const bufferedInvites = buffered.map((item) => item.invite).filter(survives);

        set({
            invites: mergeInvites(retained, [...incoming, ...bufferedInvites]),
            cursor: effectiveCursor,
            // 이 조회가 "처리 가능"이라고 확인해 준 전부. 이후 지연 도착한 커서 이하의
            // PENDING은 이 집합에 없으면 이미 종료된 것으로 본다(AC-05).
            snapshotPendingIds: effectivePendingIds,
            // 커서가 앞서 나간 응답만 순번을 차지한다 — 뒤처진 응답이 ticket만 크다는 이유로
            // 더 새로운 지식을 밀어내지 못하게 한다.
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

    /**
     * live로 도착한 초대 상태 하나를 반영한다.
     *
     * **소리를 소모하지 않는다.** 소리 적격성은 호출자가 consumeInviteSound로 따로 묻는다 —
     * 그래야 notification_created와 game_invite_received가 어느 순서로 와도 최초 후보가
     * 한 번만 인정된다.
     *
     * 복원 전에 도착하면 소리 봉투(sfxEvent)까지 함께 버퍼에 담는다. 봉투를 버리면 복원이
     * 끝난 뒤 그 사건을 소리 후보로 되살릴 방법이 없어, 복원 중에 온 **진짜 신규 초대**가
     * 영원히 무음이 된다(AC-07).
     */
    receiveLiveInvite: (accountId, invite, sfxEvent = null) => {
        const state = get();
        if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" };
        if (!isUsableInvite(invite)) return { applied: false, reason: "invalid" };
        // 서버 emitToUser가 이미 대상을 제한하지만, 계정 전환 직후 도착한 늦은 사건을 막는
        // 이중 방어다.
        if (invite.receiverId !== accountId) return { applied: false, reason: "receiver-mismatch" };

        if (!state.snapshotLoaded) {
            set({ liveBuffer: [...state.liveBuffer, { invite, sfxEvent }] });
            return { applied: false, reason: "buffered" };
        }

        // 해소된 snapshot이 "이 초대는 처리 가능한 목록에 없다"고 확인해 준 커서 이하의
        // PENDING은 지연 도착한 과거 사건이다 — 다시 넣으면 취소된 초대가 수락 버튼과 함께
        // 되살아난다(AC-05). 종료 상태 갱신은 그대로 반영해 이력을 최신으로 맞춘다.
        if (!isActionablePending(invite, state.snapshotPendingIds, state.cursor, state.snapshotLoaded)) {
            return { applied: false, reason: "known-terminal" };
        }

        const invites = mergeInvites(state.invites, [invite]);

        // ── 재조회 중이면 봉투를 보관한다 (review5 #3) ────────────────────────
        //
        // beginResync는 snapshotLoaded를 내리지만, **재조회**(패널 열기·새로고침이 부르는
        // loadSnapshot)는 snapshotLoaded를 true로 둔 채 restorePending만 세운다. 그 구간의
        // 소리 판정은 evaluateInviteSound가 "restore-pending"으로 보류하고 표식도 소모하지
        // 않는다 — 곧 바뀔 수 있는 커서로는 신규 여부를 단정할 수 없기 때문이다.
        //
        // 그런데 예전에는 위 `!snapshotLoaded`에서만 버퍼에 담아서, 보류된 그 사건의 봉투를
        // 여기서 그냥 버렸다. 그래서 복원이 끝난 뒤 후보로 되살릴 방법이 없어 **재조회 중에
        // 도착한 진짜 신규 초대가 영원히 무음**이 됐다(AC-07).
        //
        // 목록 반영은 미루지 않는다 — 소리 경계 때문에 수락·거절이 막히면 안 된다. 봉투만
        // 따로 남겨 두면 loadSnapshot이 새 커서로 다시 판정해 정확히 한 번 후보로 돌려준다.
        if (state.restorePending
            && sfxEvent !== null && sfxEvent !== undefined
            && !state.soundConsumed.has(invite.inviteId)) {
            set({ invites, liveBuffer: [...state.liveBuffer, { invite, sfxEvent }] });
            return { applied: true, deferredSound: true };
        }

        set({ invites });
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
        if (!evaluateInviteSound(state, accountId, invite, now).eligible) return false;

        const soundConsumed = new Set(state.soundConsumed);
        soundConsumed.add(invite.inviteId);
        set({ soundConsumed });
        return true;
    },

    /** 읽기 전용 사유 조회(진단 전용). 표식을 소모하지 않는다. */
    explainInviteSound: (accountId, invite, now = Date.now()) => (
        evaluateInviteSound(get(), accountId, invite, now)
    ),

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
     * creationKey는 **논리 발송 하나**를 식별하는 멱등 키다. 매 네트워크 시도마다 새 키를
     * 만들면 응답 유실 재시도가 두 번째 초대를 만들고, 반대로 (roomId,receiverId)로 영원히
     * 고정하면 초대가 끝난(거절·만료) 뒤의 의도적인 재초대가 옛 종료 행을 성공으로 되돌려
     * 받아 아무 일도 일어나지 않는다. 그래서 키에 논리 발송 번호를 붙이고,
     *
     *   - 서버가 결과를 확정하면(성공 또는 status가 있는 명시적 거부) 다음 번호로 넘어간다.
     *   - 응답 자체를 받지 못했으면(네트워크·타임아웃) **같은 번호를 유지**해 재시도가 같은
     *     키로 나간다.
     *
     * 중복 PENDING은 서버가 한 번 더 막는다 — 같은 방 인스턴스로 살아 있는 초대가 있으면
     * 새 키로 와도 기존 행을 돌려주고 새 사건을 발행하지 않는다(createInvite).
     *
     * @param {string} receiverId 초대 대상 계정 uuid
     * @param {string} keyScope   논리 발송의 범위(`${roomId}:${receiverId}`)
     */
    sendInvite: async (receiverId, keyScope) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        if (get().sendingReceiverIds.has(receiverId)) return { ok: false, reason: "in-progress" };

        const scope = typeof keyScope === "string" && keyScope.length > 0 ? keyScope : receiverId;
        const attempt = get().sendKeys[scope] ?? 1;
        // lifecycle 표식이 함께 들어간다 — 로그아웃·계정 전환·새로고침으로 번호가 1로
        // 돌아가도 서버에 남은 옛 키와 부딪히지 않는다. 같은 lifecycle 안의 재시도는
        // 표식·번호가 모두 그대로라 **정확히 같은 키**다.
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
        // 서버가 결과를 확정했을 때만 다음 논리 발송으로 넘어간다. 그 사이 다른 경로가 이미
        // 번호를 올렸다면(동시 클릭) 뒤로 되돌리지 않는다.
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
            // 서버가 **확정해서 거부한** 경우에만 이 논리 발송을 끝낸다. 5xx나 응답 없음은
            // 쓰기가 커밋되지 않았다는 증거가 아니므로 같은 키를 남겨 다음 시도가 멱등하게
            // 나가도록 한다(establishesTerminalRefusal 참고).
            if (establishesTerminalRefusal(error?.status)) advanceKey();
            set((state) => ({
                sendErrors: { ...state.sendErrors, [receiverId]: error?.message ?? "초대를 보내지 못했습니다." },
            }));
            return { ok: false, reason: "error", message: error?.message, creationKey };
        }
    },

    /** 이 시도 하나를 식별하는 번호. 완료 시 소유 대조에 쓴다. */
    beginAcceptOperation: () => nextOperationId(),

    /**
     * 수락 시도의 진행 표시. 실제 수락은 소켓 경계가 소유한다.
     *
     * owner를 주면 **자기가 세운 표시만** 내린다. 계정이 A → B → A로 오간 사이에 도착한
     * 옛 시도의 완료가 지금 진행 중인 새 시도의 잠금을 풀어 중복 수락을 열지 않게 하는
     * 소유 대조다(owner 생략 시에는 예전처럼 무조건 반영한다).
     */
    markAcceptPending: (inviteId, pending, owner = undefined) => set((state) => {
        if (pending) {
            const next = new Set(state.pendingInviteIds).add(inviteId);
            return owner === undefined
                ? { pendingInviteIds: next }
                : { pendingInviteIds: next, acceptOwners: { ...state.acceptOwners, [inviteId]: owner } };
        }
        // 지금 이 표시의 주인이 내가 아니면 아무것도 하지 않는다.
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

/** 화면에 보여줄 "아직 처리할 수 있는" 초대만 고른다(만료는 서버가 확정하지만 표시도 맞춘다). */
export function selectPendingInvites(invites, now = Date.now()) {
    return invites.filter((invite) => {
        if (invite.status !== "PENDING") return false;
        const expiresAt = Date.parse(invite.expiresAt ?? "");
        return !Number.isFinite(expiresAt) || expiresAt > now;
    });
}
