// 점검 큰 안내·띠 문구: 안내 모양(view)마다 제목·설명·버튼 글
// 데스크톱·모바일 MaintenanceNotice·MaintenanceBand가 같이 씀 (두 화면 문구 같게)

export const FORCE_END_LINE = "시각이 되면 진행 중 판이 강제로 끝나요."

// 강제 종료 안내 (판 끝남 / 대기방 닫힘)
const FORCED = Object.freeze({
  game: { title: "점검으로 판이 끝났어요", detail: "승패 없이 끝났어요. 보상과 벌점도 없어요." },
  room: { title: "점검으로 대기방이 닫혔어요", detail: "점검이 끝나면 다시 방을 만들어 주세요." },
})

// view → { title, detail, button } (큰 안내 창 글)
export function bigNoticeCopy(view) {
  if (view.mode === "forced") {
    const forced = FORCED[view.forcedKind] ?? FORCED.game
    return { ...forced, button: "로비로 가기" }
  }
  if (view.state === "active") {
    const until = view.endsAtText ? `${view.endsAtText}쯤 끝날 예정이에요.` : "끝나면 다시 들어와 주세요."
    return { title: "지금 점검 중이에요", detail: until, button: "확인했어요" }
  }
  return { title: "점검 예정이에요", detail: FORCE_END_LINE, button: "확인했어요" }
}

// view → 띠 글 (예: "점검까지 4분 05초")
export function bandCopy(view) {
  return view.state === "active" ? "지금 점검 중이에요" : `점검까지 ${view.remainingText}`
}
