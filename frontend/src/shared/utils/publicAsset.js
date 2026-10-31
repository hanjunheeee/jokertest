export function publicAsset(path) {
    const withLeadingSlash = path.startsWith("/") ? path : `/${path}`
    const normalized = withLeadingSlash.normalize("NFC")

    return encodeURI(normalized)
}
