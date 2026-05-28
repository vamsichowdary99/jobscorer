'use client'

import {
    useState,
    useId,
    useRef,
    useEffect,
    createContext,
    useContext,
    isValidElement,
} from 'react'
import {
    AnimatePresence,
    MotionConfig,
    motion,
    Transition,
    Variants,
} from 'framer-motion'
import { useClickOutside } from '@/hooks/use-click-outside'
import { cn } from '@/lib/utils'

const TRANSITION: Transition = {
    type: 'spring',
    bounce: 0.1,
    duration: 0.4,
}

type MorphingPopoverContextValue = {
    isOpen: boolean
    open: () => void
    close: () => void
    uniqueId: string
    variants?: Variants
}

const MorphingPopoverContext =
    createContext<MorphingPopoverContextValue | null>(null)

// Cache motion components per element type so we never create them during render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const motionComponentCache = new WeakMap<any, any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMotionComponent(type: any) {
    let cached = motionComponentCache.get(type)
    if (!cached) {
        cached = motion.create(type as React.ForwardRefExoticComponent<Record<string, unknown>>)
        motionComponentCache.set(type, cached)
    }
    return cached
}

function usePopoverLogic({
    defaultOpen = false,
    open: controlledOpen,
    onOpenChange,
}: {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
} = {}) {
    const uniqueId = useId()
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)

    const isOpen = controlledOpen ?? uncontrolledOpen

    const open = () => {
        if (controlledOpen === undefined) setUncontrolledOpen(true)
        onOpenChange?.(true)
    }

    const close = () => {
        if (controlledOpen === undefined) setUncontrolledOpen(false)
        onOpenChange?.(false)
    }

    return { isOpen, open, close, uniqueId }
}

export type MorphingPopoverProps = {
    children: React.ReactNode
    transition?: Transition
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    variants?: Variants
    className?: string
} & Omit<React.ComponentProps<'div'>, 'children'>

function MorphingPopover({
    children,
    transition = TRANSITION,
    defaultOpen,
    open,
    onOpenChange,
    variants,
    className,
    ...props
}: MorphingPopoverProps) {
    const popoverLogic = usePopoverLogic({ defaultOpen, open, onOpenChange })

    return (
        <MorphingPopoverContext.Provider value={{ ...popoverLogic, variants }}>
            <MotionConfig transition={transition}>
                <div
                    className={cn('relative flex items-center justify-center', className)}
                    key={popoverLogic.uniqueId}
                    {...props}
                >
                    {children}
                </div>
            </MotionConfig>
        </MorphingPopoverContext.Provider>
    )
}

export type MorphingPopoverTriggerProps = {
    asChild?: boolean
    children: React.ReactNode
    className?: string
} & React.ComponentProps<typeof motion.button>

function MorphingPopoverTrigger({
    children,
    className,
    asChild = false,
    ...props
}: MorphingPopoverTriggerProps) {
    const context = useContext(MorphingPopoverContext)
    if (!context) {
        throw new Error('MorphingPopoverTrigger must be used within MorphingPopover')
    }

    if (asChild && isValidElement(children)) {
        // Component identity is cached per element-type in module scope, so this is stable across renders.
        const MotionComponent = getMotionComponent(children.type)
        const childProps = children.props as Record<string, unknown>

        return (
            // eslint-disable-next-line react-hooks/static-components
            <MotionComponent
                {...childProps}
                onClick={context.open}
                layoutId={`popover-trigger-${context.uniqueId}`}
                className={childProps.className as string | undefined}
                key={context.uniqueId}
                aria-expanded={context.isOpen}
                aria-controls={`popover-content-${context.uniqueId}`}
            />
        )
    }

    return (
        <motion.div
            key={context.uniqueId}
            layoutId={`popover-trigger-${context.uniqueId}`}
            onClick={context.open}
        >
            <motion.button
                {...props}
                layoutId={`popover-label-${context.uniqueId}`}
                key={context.uniqueId}
                className={className}
                aria-expanded={context.isOpen}
                aria-controls={`popover-content-${context.uniqueId}`}
            >
                {children}
            </motion.button>
        </motion.div>
    )
}

export type MorphingPopoverContentProps = {
    children: React.ReactNode
    className?: string
} & React.ComponentProps<typeof motion.div>

function MorphingPopoverContent({
    children,
    className,
    ...props
}: MorphingPopoverContentProps) {
    const context = useContext(MorphingPopoverContext)
    if (!context)
        throw new Error('MorphingPopoverContent must be used within MorphingPopover')

    const ref = useRef<HTMLDivElement>(null)
    useClickOutside(ref, context.close)

    const { isOpen, close } = context
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, close])

    return (
        <AnimatePresence>
            {context.isOpen && (
                <motion.div
                    {...props}
                    ref={ref}
                    layoutId={`popover-trigger-${context.uniqueId}`}
                    key={context.uniqueId}
                    id={`popover-content-${context.uniqueId}`}
                    role="dialog"
                    aria-modal="true"
                    className={cn(
                        'absolute overflow-hidden rounded-md border border-zinc-950/10 bg-white p-2 text-zinc-950 shadow-md dark:border-zinc-50/10 dark:bg-zinc-700 dark:text-zinc-50',
                        className
                    )}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={context.variants}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export { MorphingPopover, MorphingPopoverTrigger, MorphingPopoverContent }
