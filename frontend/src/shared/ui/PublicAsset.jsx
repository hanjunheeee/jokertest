// publicAsset 함수는 이미지 경로를 브라우저가 읽을 수 잇는 URL로 바꿔주는 유틸 함수
import { publicAsset } from "@/shared/utils/publicAsset";

// PublicAsset 컴포넌트
// src, alt, className을 받아서 img 태그를 만들어줍니다.
export default function PublicAsset( {src, alt = "", className, ...props}) {
    return (
        <img
            // src로 받은 이미지 경로를 publicAsset 함수로 정리한 뒤 img의 src에 넣습니다.
            src = {publicAsset(src)}

            // alt가 없으면 기본값으로 빈 문자열("")을 사용합니다.
            alt={alt}

            // 부모 컴포넌트에서 넘겨준 className을 그대로 img에 적용
            className={className}

            // img가 마우스로 드래그되지 않게 막습니다.
            draggable={false}

            // width, height, onClick, style 같은 나머지 속성들을 img에 그대로 전달
            {...props}
        />
    )
}
