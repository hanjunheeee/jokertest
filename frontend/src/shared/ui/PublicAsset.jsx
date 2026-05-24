import { publicAsset } from "@/shared/utils/publicAsset"

export default function PublicAsset({ src, alt = "", className, ...props }) {
  return (
    <img
      src={publicAsset(src)}
      alt={alt}
      className={className}
      draggable={false}
      {...props}
    />
  )
}