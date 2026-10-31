import { publicAsset } from "@/shared/utils/publicAsset";

export default function PublicAsset({
    src,
    alt = "",
    className,
    onError,
    ...props
}) {
    const handleError = (event) => {
        const image = event.currentTarget

        if (image.dataset.nfdFallbackSource !== src) {
            const normalized = src.startsWith("/") ? src : `/${src}`
            const fallbackSrc = encodeURI(normalized.normalize("NFD"))

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
