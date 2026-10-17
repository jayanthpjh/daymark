import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './primitives';

export function Modal({ open, onOpenChange, title, description, children, footer, side }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode; side?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content aria-describedby={description ? undefined : undefined} className={cn('fixed z-50 flex flex-col bg-surface shadow-xl focus:outline-none', side ? 'inset-y-0 right-0 w-full max-w-[520px] border-l border-line' : 'left-1/2 top-1/2 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line')}>
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div><Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>{description ? <Dialog.Description className="text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}</div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X size={16} /></Button></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Replacement for window.confirm(). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', danger, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }) {
  return <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => { onOpenChange(false); onConfirm(); }}>{confirmLabel}</Button></>} />;
}

export const TabsRoot = Tabs.Root;
export const TabsList = ({ className, ...p }: React.ComponentProps<typeof Tabs.List>) => <Tabs.List className={cn('flex gap-1 overflow-x-auto rounded-card bg-muted-surface p-1', className)} {...p} />;
export const TabsTrigger = ({ className, ...p }: React.ComponentProps<typeof Tabs.Trigger>) => <Tabs.Trigger className={cn('min-h-10 shrink-0 rounded-control px-3 text-[13px] font-medium text-muted data-[state=active]:bg-surface data-[state=active]:text-brand data-[state=active]:shadow-sm', className)} {...p} />;
export const TabsContent = ({ className, ...p }: React.ComponentProps<typeof Tabs.Content>) => <Tabs.Content className={cn('pt-4 focus:outline-none', className)} {...p} />;
