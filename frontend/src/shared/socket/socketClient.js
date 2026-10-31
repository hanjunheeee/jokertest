let _socket = null

const listeners = new Set()

export const getSocket = () => _socket

export const setSocket = (s) => {
  if (s === _socket) return
  _socket = s
  listeners.forEach((listener) => listener())
}

export const subscribeSocket = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
