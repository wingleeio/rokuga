import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '../../lib/cn'

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): JSX.Element {
  return (
    <LabelPrimitive.Root
      className={cn('text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}
