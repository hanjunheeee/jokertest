// 게임 초대 소리 진단 입구 (켜기 판정·기록·요약을 한 경로로 내보냄)
// 초대 소리 흐름·진단 패널·시험이 이 경로로 씀
import { getInviteSfxObservations } from "./inviteSfx/log.js";
import { summarize } from "../utils/inviteSfxSummary.js";

export { INVITE_SFX_QA_FLAG, INVITE_SFX_DIAGNOSTICS_LIMIT } from "../constants/inviteSfxDiagnostics.js";
export { __setInviteSfxDiagnosticsEnvForTests, isInviteSfxDiagnosticsEnabled } from "./inviteSfx/flag.js";
export {
    syncInviteSfxDiagnosticsAccount,
    resetInviteSfxDiagnostics,
    recordInviteSfxObservation,
    trackInviteSfxCompletion,
    getInviteSfxObservations,
    getInviteSfxDiagnosticsAccount,
    subscribeInviteSfxObservations,
} from "./inviteSfx/log.js";

// 인자 없이 부르면 지금 기록을 요약함
export function summarizeInviteSfxObservations(observations = getInviteSfxObservations()) {
    return summarize(observations);
}
