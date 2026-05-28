export type ClassValue =
    | string
    | number
    | null
    | false
    | undefined
    | ClassValue[]
    | { [key: string]: unknown }

function toClass(v: ClassValue): string {
    if (!v) return ''
    if (typeof v === 'string' || typeof v === 'number') return String(v)
    if (Array.isArray(v)) return v.map(toClass).filter(Boolean).join(' ')
    if (typeof v === 'object') {
        return Object.keys(v).filter(k => Boolean((v as Record<string, unknown>)[k])).join(' ')
    }
    return ''
}

export function cn(...inputs: ClassValue[]): string {
    return inputs.map(toClass).filter(Boolean).join(' ')
}
