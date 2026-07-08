'use client'
import React, { createContext, useContext } from 'react'
import type { DecorationsMap } from './types'

export function decorationKey(section: string, index?: number, bulletIndex?: number): string {
    return `${section}:${index ?? ''}:${bulletIndex ?? ''}`
}

const PreviewDecorationsContext = createContext<DecorationsMap>(new Map())

export function PreviewDecorationsProvider({
    decorations, children,
}: {
    decorations: DecorationsMap
    children: React.ReactNode
}) {
    return (
        <PreviewDecorationsContext.Provider value={decorations}>
            {children}
        </PreviewDecorationsContext.Provider>
    )
}

export function usePreviewDecorations(): DecorationsMap {
    return useContext(PreviewDecorationsContext)
}
