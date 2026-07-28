// Resume Budget (plans/25 Phase 4) — measures REAL PDF pagination, not a
// word-count heuristic. Renders the same PDF bytes the Download button would
// produce, then reads the actual page count plus how far content extends on
// the last page (via pdf.js text-item y-positions) to get an honest fill %.

export interface BudgetResult {
    pages: number
    fullnessPercent: number // relative to pageTarget; can exceed 100
    overBudget: boolean
}

let workerConfigured = false

// pdfjs-dist's getTextContent() does `for await (const value of readableStream)`
// internally — native async iteration over a ReadableStream. WebKit (all iOS
// browsers, including "Chrome Mobile iOS" — Apple requires the same engine)
// doesn't implement ReadableStream's async iterator protocol, so this throws
// "undefined is not a function" on real iPhones (confirmed via Sentry
// JAVASCRIPT-NEXTJS-5) — not reproducible via Chrome DevTools' iPhone
// emulation, which is still real Chromium under the hood. Polyfilling once,
// client-side only, before pdfjs ever runs.
function polyfillReadableStreamAsyncIterator() {
    if (typeof ReadableStream === 'undefined') return
    const proto = ReadableStream.prototype as ReadableStream & { [Symbol.asyncIterator]?: unknown }
    if (typeof proto[Symbol.asyncIterator] === 'function') return
    proto[Symbol.asyncIterator] = function (this: ReadableStream) {
        const reader = this.getReader()
        return {
            async next() {
                const { done, value } = await reader.read()
                return { done, value }
            },
            async return(value?: unknown) {
                await reader.cancel()
                return { done: true, value }
            },
            [Symbol.asyncIterator]() { return this },
        }
    }
}

async function getPdfjs() {
    polyfillReadableStreamAsyncIterator()
    const pdfjs = await import('pdfjs-dist')
    if (!workerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
        workerConfigured = true
    }
    return pdfjs
}

export async function measureBudget(pdfBlob: Blob, pageTarget: number): Promise<BudgetResult> {
    const pdfjs = await getPdfjs()
    const buf = await pdfBlob.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: buf }).promise
    const pages = doc.numPages

    const lastPage = await doc.getPage(pages)
    const viewport = lastPage.getViewport({ scale: 1 })
    const textContent = await lastPage.getTextContent()

    // PDF y-origin is bottom-left, so the smallest y among text items marks
    // how far down the page content actually extends.
    let minY = viewport.height
    for (const item of textContent.items as Array<{ transform?: number[] }>) {
        const y = item.transform?.[5]
        if (typeof y === 'number' && y < minY) minY = y
    }
    const lastPageFill = viewport.height > 0
        ? Math.min(1, Math.max(0, (viewport.height - minY) / viewport.height))
        : 0

    const usedPageUnits = (pages - 1) + lastPageFill
    const fullnessPercent = Math.round((usedPageUnits / Math.max(1, pageTarget)) * 100)

    return { pages, fullnessPercent, overBudget: pages > pageTarget }
}
