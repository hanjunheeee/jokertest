// 프로필 편집 목록 상태 글 (불러오는 중·실패와 다시 시도·비었음)
// OptionGrid가 씀
export default function OptionStatus({ status, onRetry, loadingText, errorText, emptyText }) {
  const textClass = "font-subheading text-sm text-[#5c554d]"

  if (status === "loading") {
    return <p role="status" className={`py-6 text-center ${textClass}`}>{loadingText}</p>
  }

  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
        <p className={textClass}>{errorText}</p>
        <button
          type="button"
          onClick={() => onRetry()}
          className="min-h-11 rounded-md border border-[#b83232]/40 bg-transparent px-4 font-subheading text-sm text-[#b83232] active:opacity-70"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return <p className={`py-6 text-center ${textClass}`}>{emptyText}</p>
}
