// RouterProvider와 같은 router.navigate (소켓·zustand 구독에서 useNavigate 대신)
let navigateImpl = null

export function registerMatchingRouterNavigate(fn) {
  navigateImpl = typeof fn === "function" ? fn : null
}

export function matchingRouterNavigate(to, options) {
  if (navigateImpl) {
    navigateImpl(to, options)
    return true
  }
  return false
}