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
export default function PublicAsset({
  src, // /로 시작하는 public 폴더 내 이미지 경로 (publicAsset 함수가 실제 BASE 경로로 변환)
  alt = "", // 대체 텍스트 (장식용 이미지가 많아 기본값은 빈 문자열)
  className, // img에 적용할 클래스
  ...props // draggable을 제외한 나머지 img 속성(예: aria-hidden)은 그대로 전달
}) {
  return (
    <img
      src={publicAsset(src)}
      alt={alt}
      className={className}
      draggable={false} // 이미지를 드래그해서 옮기는 브라우저 기본 동작을 막음
      {...props}
    />
  )
}
