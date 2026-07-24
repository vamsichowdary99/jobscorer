'use client'

import React, { useEffect, useRef, useState } from 'react'

// Scales a fixed-width (700px) preview down to fit its actual container
// width — replaces a hardcoded `zoom: 0.4x`, which is a fixed shrink factor
// independent of screen size. On a narrower phone the same fixed-width
// content rendered no smaller than on a wider phone, so proportionally far
// less of it fit before the modal's scroll area ran out. `transform: scale()`
// (not `zoom`) keeps this consistent with ResumePreviewInner.tsx's existing
// pattern; the wrapper's height is measured and scaled to match so no extra
// blank scroll space is left below the shrunk content.
const NATIVE_WIDTH = 700

export default function MobilePreviewScaler({ children }: { children: React.ReactNode }) {
    const outerRef = useRef<HTMLDivElement>(null)
    const innerRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)
    const [nativeHeight, setNativeHeight] = useState(0)

    useEffect(() => {
        const outer = outerRef.current
        const inner = innerRef.current
        if (!outer || !inner) return

        const recompute = () => {
            setScale(Math.min(outer.clientWidth / NATIVE_WIDTH, 1))
            setNativeHeight(inner.scrollHeight)
        }
        recompute()

        const ro = new ResizeObserver(recompute)
        ro.observe(outer)
        ro.observe(inner)
        return () => ro.disconnect()
    }, [children])

    return (
        <div ref={outerRef} style={{ width: '100%', height: nativeHeight * scale, overflow: 'hidden' }}>
            <div ref={innerRef} style={{ width: NATIVE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                {children}
            </div>
        </div>
    )
}
