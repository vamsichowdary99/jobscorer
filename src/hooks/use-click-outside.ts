import { RefObject, useEffect } from 'react'

type Handler = (event: MouseEvent | TouchEvent) => void

export function useClickOutside<T extends HTMLElement = HTMLElement>(
    ref: RefObject<T | null>,
    handler: Handler,
    mouseEvent: 'mousedown' | 'mouseup' = 'mousedown'
): void {
    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            const el = ref?.current
            const target = event.target
            if (!el || !target || el.contains(target as Node)) return
            handler(event)
        }
        document.addEventListener(mouseEvent, listener)
        document.addEventListener('touchstart', listener)
        return () => {
            document.removeEventListener(mouseEvent, listener)
            document.removeEventListener('touchstart', listener)
        }
    }, [ref, handler, mouseEvent])
}
