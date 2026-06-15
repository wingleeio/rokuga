import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cn } from '../../lib/cn'

export function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>): JSX.Element {
  return (
    <ToggleGroupPrimitive.Root
      className={cn('inline-flex w-full gap-1 rounded-lg bg-secondary/40 p-1', className)}
      {...props}
    />
  )
}

export function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>): JSX.Element {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none data-[state=on]:bg-accent data-[state=on]:text-foreground',
        className
      )}
      {...props}
    />
  )
}
