import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/cn'

const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>): JSX.Element {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center justify-center rounded-lg bg-secondary/40 p-1 text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>): JSX.Element {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-accent data-[state=active]:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>): JSX.Element {
  return (
    <TabsPrimitive.Content
      className={cn('mt-0 focus-visible:outline-none', className)}
      {...props}
    />
  )
}

export { Tabs }
