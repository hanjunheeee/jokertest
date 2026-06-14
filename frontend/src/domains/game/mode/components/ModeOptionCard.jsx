import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const CARD_BTN_CLASS = "interactive-scale min-w-0 flex-1"

const CARD_IMAGE_CLASS =
  "pointer-events-none mx-auto block h-auto w-full max-w-[clamp(13rem,24vw,20.5rem)] select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"

export default function ModeOptionCard({ label, frame, onSelect }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onSelect}
      className={CARD_BTN_CLASS}
    >
      <PublicAsset src={frame} alt={label} className={CARD_IMAGE_CLASS} />
    </button>
  )
}
