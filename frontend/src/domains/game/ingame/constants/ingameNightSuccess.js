// 밤 성공 연출 고정 값: 영상 캔버스 모양, 자료 대기 문구, 최종 결과 문구
// 밤 성공 연출 화면(components/nightSuccess/, InGameNightSuccessPresentation)이 사용

export const ROLE_VIDEO_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

// 원본 영상은 숨기고 캔버스에 합친 그림만 보여 줌
export const HIDDEN_VIDEO_STYLE = Object.freeze({ display: "none" })

// 영상 자료가 아직 없을 때 대기 문구를 띄우는 사건 종류
const PENDING_SUPPORTED_TYPES = new Set(["HEAL", "INVESTIGATE", "CONFIRM"])

// 대기 문구 (띄우지 않는 종류면 null)
export function buildPendingAssetLabel(type) {
  if (!PENDING_SUPPORTED_TYPES.has(type)) return null
  return "연출 자료 대기 중입니다."
}

export function buildFinalStatusLabel(alive) {
  return alive ? "최종 결과, 생존했습니다." : "최종 결과, 사망했습니다."
}
