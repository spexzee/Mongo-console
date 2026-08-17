'use client'

import React from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function DocumentEditorDialog({
  open,
  onOpenChange,
  document,
  connId,
  dbName,
  colName,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  document?: any
  connId: string
  dbName: string
  colName: string
  onSuccess: () => void
}) {
  const isEdit = !!document
  const [content, setContent] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      if (document) {
        setContent(JSON.stringify(document, null, 2))
      } else {
        setContent('{\n  \n}')
      }
    }
  }, [open, document])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (isEdit) {
        const id = document._id?.$oid || document._id
        await api.db({
          connectionId: connId,
          database: dbName,
          collection: colName,
          action: 'replaceDocument',
          id,
          document: content,
        })
        toast.success('Document updated')
      } else {
        await api.db({
          connectionId: connId,
          database: dbName,
          collection: colName,
          action: 'insertDocuments',
          documents: content,
        })
        toast.success('Document inserted')
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save document')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Document' : 'Insert Document'}</DialogTitle>
            <DialogDescription>
              Write valid Extended JSON or MongoDB relaxed-JSON document syntax.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 flex-1 flex flex-col min-h-[300px]">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 font-mono text-xs resize-none bg-muted/20"
              placeholder="{\n  &quot;name&quot;: &quot;John Doe&quot;\n}"
              required
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Update Document' : 'Insert Document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
