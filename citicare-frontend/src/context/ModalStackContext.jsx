import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ModalStackContext = createContext({
  stack: [],
  push: () => {},
  remove: () => {},
  isTop: () => true,
})

export const useModalStack = () => useContext(ModalStackContext)

// Tracks open modals in order. Only the top of the stack is visible -
// previously opened modals stay mounted (state preserved) but hidden,
// and reappear when the modal above them closes. This avoids double
// layers of modal + backdrop.
export const ModalStackProvider = ({ children }) => {
  const [stack, setStack] = useState([])

  const push = useCallback(id => {
    setStack(prev => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const remove = useCallback(id => {
    setStack(prev => prev.filter(x => x !== id))
  }, [])

  const isTop = useCallback(
    id => stack.length === 0 || stack[stack.length - 1] === id,
    [stack]
  )

  // Lock page scrolling for as long as at least one modal is open, and
  // restore the previous value when the last one closes (nested modals used
  // to unlock the page when the inner one closed).
  const previousOverflow = useRef(null)
  useEffect(() => {
    if (stack.length > 0) {
      if (previousOverflow.current === null) {
        previousOverflow.current = document.body.style.overflow
      }
      document.body.style.overflow = 'hidden'
    } else if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current
      previousOverflow.current = null
    }
  }, [stack.length])

  useEffect(() => () => {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current
      previousOverflow.current = null
    }
  }, [])

  const value = useMemo(
    () => ({ stack, push, remove, isTop }),
    [stack, push, remove, isTop]
  )

  return (
    <ModalStackContext.Provider value={value}>
      {children}
    </ModalStackContext.Provider>
  )
}
