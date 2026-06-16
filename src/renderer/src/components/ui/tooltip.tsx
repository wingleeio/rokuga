import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../../lib/cn'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>): JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 select-none rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md',
          'data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

/** Convenience: wrap any element with a tooltip. `kbd` renders a shortcut hint. */
export function Hint({
  label,
  kbd,
  side = 'top',
  children
}: {
  label: string
  kbd?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-1.5">
        <span>{label}</span>
        {kbd && (
          <kbd className="rounded border border-border bg-secondary px-1 font-mono text-[10px] text-muted-foreground">
            {kbd}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipProvider }
