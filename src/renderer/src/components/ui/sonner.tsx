import { Toaster as Sonner } from 'sonner'

export function Toaster(): JSX.Element {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      offset={20}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group flex items-center gap-3 rounded-lg border border-border bg-popover/95 px-4 py-3 text-[13px] text-popover-foreground shadow-lg backdrop-blur',
          title: 'font-medium',
          description: 'text-muted-foreground',
          actionButton:
            '!bg-primary !text-primary-foreground !rounded-md !px-2.5 !py-1 !text-xs !font-medium',
          icon: 'text-muted-foreground'
        }
      }}
    />
  )
}
