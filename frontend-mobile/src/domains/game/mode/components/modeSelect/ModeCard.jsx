// 모드 카드 하나: 틀 그림·제목·설명, 준비중이면 잠금 + "준비중..." 가림막
// ModeCardList가 씀, 글자 크기는 카드 폭 기준(cqw)이라 폰·태블릿 어디서나 같은 비율
import {
  COMING_SOON_OVERLAY_CLASS,
  DESC_INSET,
  FRAME_IMG_CLASS,
  MODE_CARD_TITLE_INSET,
} from "@/domains/game/mode/constants/modeCardLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 모드 카드 버튼 (mode는 데스크톱 GAME_MODES 항목)
export default function ModeCard({ mode, onSelect, className = "" }) {
  const { label, title, descriptionLines, frame, comingSoon = false } = mode

  return (
    <button
      type="button"
      aria-label={comingSoon ? `${label} 준비중` : label}
      disabled={comingSoon}
      onClick={onSelect}
      className={`@container relative block shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      <PublicAsset
        src={frame}
        alt=""
        className={FRAME_IMG_CLASS}
      />

      {title ? (
        <span
          className="pointer-events-none absolute z-[1] text-center font-display text-[length:calc(11cqw*var(--app-text-scale,1))] font-medium leading-none text-[#1a1008] antialiased"
          style={MODE_CARD_TITLE_INSET}
          aria-hidden="true"
        >
          {title}
        </span>
      ) : null}

      {/* 설명 줄은 줄바꿈 넣어 이어 붙임 */}
      {descriptionLines?.length ? (
        <span
          className="pointer-events-none absolute z-[1] block text-center font-subheading text-[length:calc(5.2cqw*var(--app-text-scale,1))] font-bold leading-[1.45] text-[#1a1008]"
          style={DESC_INSET}
          aria-hidden="true"
        >
          {descriptionLines.map((line, index) => (
            <span key={`${index}-${line}`} className="block">
              {line}
            </span>
          ))}
        </span>
      ) : null}

      {comingSoon ? (
        <span
          className={COMING_SOON_OVERLAY_CLASS}
          aria-hidden="true"
        >
          <span className="font-display text-[length:calc(12cqw*var(--app-text-scale,1))] font-semibold tracking-[0.12em] text-[#ead9b7] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            준비중...
          </span>
        </span>
      ) : null}
    </button>
  )
}
