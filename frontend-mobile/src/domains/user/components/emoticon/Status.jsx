// 이모티콘 화면 안내 줄 (불러오는 중·불러오기 실패와 다시 시도·버전 충돌·저장 실패)
// EmoticonPalettePage가 씀
const TEXT_CLASS =
  "text-center font-subheading text-sm font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 데스크톱 EmoticonPaletteStatus와 같은 문구, 상황마다 한 줄씩
export default function Status({ status, conflict, notice, onRetry }) {
  if (status !== "loading" && status !== "error" && !conflict && !notice) return null

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 px-4 pb-1">
      {status === "loading" ? (
        <p role="status" className={TEXT_CLASS}>이모티콘 팔레트를 불러오는 중입니다.</p>
      ) : null}

      {status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-2">
          <span className={TEXT_CLASS}>이모티콘 팔레트를 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={() => onRetry()}
            className="min-h-11 rounded border border-[#c9b892]/60 bg-black/45 px-4 font-subheading text-sm font-bold text-[#f5f0e6] active:scale-95"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {conflict ? (
        <p role="status" className={`${TEXT_CLASS} text-[#e8c878]`}>
          팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.
        </p>
      ) : null}

      {notice ? (
        <p role="alert" className={`${TEXT_CLASS} rounded bg-black/55 px-2 py-0.5 text-[#ff8a7a]`}>{notice.text}</p>
      ) : null}
    </div>
  )
}
