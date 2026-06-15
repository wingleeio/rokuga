import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../../lib/cn'

export function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>): JSX.Element {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-foreground/70" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border border-black/30 bg-foreground shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
    </SliderPrimitive.Root>
  )
}
