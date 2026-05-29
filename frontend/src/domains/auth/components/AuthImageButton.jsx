import PublicAsset from "@/shared/ui/PublicAsset"

export default function AuthImageButton({
  src,
  label,
  className = "",
  type = "button",
  onClick,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      className={`block w-full border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
    </button>
  )
}
