// 게임 초대 소리 진단을 켤지 판정 (개발 빌드 + 주소 표시)
// 진단 기록(log.js)과 진단 패널이 씀
import { INVITE_SFX_QA_FLAG } from "../../constants/inviteSfxDiagnostics.js";

// 빌드 종류·주소를 읽는 함수, 시험에서 바꿔 끼움
let readEnv = () => ({
    dev: import.meta.env?.DEV === true,
    search: typeof window !== "undefined" ? (window.location?.search ?? "") : "",
});

export function __setInviteSfxDiagnosticsEnvForTests(next) {
    readEnv = next ?? (() => ({ dev: false, search: "" }));
}

// 운영 빌드에서는 주소에 표시가 있어도 끔, 읽다 터지면 꺼진 걸로 봄
export function isInviteSfxDiagnosticsEnabled() {
    try {
        const env = readEnv();
        if (env?.dev !== true) return false;
        const params = new URLSearchParams(env.search ?? "");
        const value = params.get(INVITE_SFX_QA_FLAG);
        return value === "1" || value === "true";
    } catch {
        return false;
    }
}
