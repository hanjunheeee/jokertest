/**
 * public/ 이미지 경로를 img로 렌더하는 공통 래퍼
 * 도메인 전반에서 PNG·프레임·버튼 이미지 표시에 사용
 *
 * props
 * - src: /로 시작하는 public 경로 (publicAsset으로 BASE 변환)
 * - alt, className: img 속성
 * - ...props: draggable=false 고정 외 나머지 img props 전달
 */
import { publicAsset } from "@/shared/utils/publicAsset"

/** publicAsset 적용 + draggable 비활성화된 공통 img */
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
