// 그림 버튼 하나 (누르는 칸 44px, 그림은 그 안에 맞춤)
// 친구 시트 줄들의 신청·수락·차단·거절·해제 버튼과 새로고침이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 처리 중엔 잠가 중복 요청을 막음, data-* 같은 나머지 속성은 버튼에 그대로 붙임
export default function IconAction({ src, label, onClick, disabled = false, dim = false, imgClassName = "size-10", ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => { if (!disabled) onClick?.() }}
      className={`grid size-11 shrink-0 place-items-center border-0 bg-transparent p-0 active:scale-95 disabled:opacity-50 ${dim ? "opacity-40" : ""}`}
      {...rest}
    >
      <PublicAsset src={src} alt="" className={`block select-none object-contain ${imgClassName}`} />
    </button>
  )
}
