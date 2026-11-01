// public 폴더 그림 img (주소 정리, 못 찾으면 한글 이름을 NFD로 바꿔 한 번 더 시도)
// 화면 컴포넌트 대부분이 씀
import { publicAsset } from "@/shared/utils/publicAsset";

// 끌기 막음, 나머지 props는 img에 그대로 넘김
export default function PublicAsset({
    src,
    alt = "",
    className,
    onError,
    ...props
}) {
    // 서버 파일 이름이 NFD(맥 방식 한글)일 때를 위해 NFD 주소로 한 번만 다시 시도
    const handleError = (event) => {
        const image = event.currentTarget

        // 이 src로 이미 다시 시도했으면 바깥 onError로 넘김
        if (image.dataset.nfdFallbackSource !== src) {
            const normalized = src.startsWith("/") ? src : `/${src}`
            const fallbackSrc = encodeURI(normalized.normalize("NFD"))

            // 이미 같은 주소면 바꿔도 소용없음
            if (fallbackSrc !== image.getAttribute("src")) {
                image.dataset.nfdFallbackSource = src
                image.src = fallbackSrc
                return
            }
        }

        onError?.(event)
    }

    return (
        <img
            src = {publicAsset(src)}

            alt={alt}

            className={className}

            draggable={false}

            onError={handleError}

            {...props}
        />
    )
}
