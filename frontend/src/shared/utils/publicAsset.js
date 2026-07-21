// public 폴더에 있는 이미지/파일 경로를 브라우저가 읽을 수 있는 URL로 바꿔주는 함수
export function publicAsset(path) {
    // path가 "/"로 시작하면 그대로 사용하고,
    // "/"로 시작하지 않으면 앞에 "/"를 붙여 절대 URL 경로 형태로 만듭니다.
    // Git/Windows/Linux checkouts use composed Korean filenames (NFC) in the
    // public directory. Some asset constants were historically normalized to
    // NFD for macOS, so normalize every URL back to NFC before requesting it.
    const withLeadingSlash = path.startsWith("/") ? path : `/${path}`
    const normalized = withLeadingSlash.normalize("NFC")

    // 경로에 공백이나 한글 같은 문자가 있어도 URL에서 안전하게 사용할 수 있도록 인코딩 합니다.
    return encodeURI(normalized)
}
