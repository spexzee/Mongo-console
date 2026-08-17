'use client'

import React from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { ConnectionSummary } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const COLORS = ['amber', 'teal', 'violet', 'rose', 'lime', 'sky']

export function ConnectionFormDialog({
  open,
  onOpenChange,
  connection,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: ConnectionSummary
  onSuccess: () => void
}) {
  const isEdit = !!connection
  const [name, setName] = React.useState(connection?.name || '')
  const [uri, setUri] = React.useState('')
  const [defaultDatabase, setDefaultDatabase] = React.useState(connection?.defaultDatabase || '')
  const [color, setColor] = React.useState(connection?.color || 'amber')
  const [readOnly, setReadOnly] = React.useState(connection?.readOnly || false)
  const [notes, setNotes] = React.useState(connection?.notes || '')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(connection?.name || '')
      setUri('')
      setDefaultDatabase(connection?.defaultDatabase || '')
      setColor(connection?.color || 'amber')
      setReadOnly(connection?.readOnly || false)
      setNotes(connection?.notes || '')
    }
  }, [open, connection])

  const handleTest = async () => {
    if (!uri && !isEdit) {
      toast.error('Enter a connection URI to test')
      return
    }
    setIsTesting(true)
    try {
      if (uri) {
        const res = await api.connections.test(uri)
        if (res.reachable) toast.success(`Test succeeded! Ping: ${res.latencyMs}ms`)
        else toast.error('Connection failed')
      } else if (connection) {
        const res = await api.db({ connectionId: connection.id, action: 'health' })
        if (res.reachable) toast.success(`Connected! Ping: ${res.latencyMs}ms`)
        else toast.error('Connection failed')
      }
    } catch (err: any) {
      toast.error(err.message || 'Connection test failed')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Profile name is required')
      return
    }
    if (!isEdit && !uri.trim()) {
      toast.error('MongoDB URI is required')
      return
    }

    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.connections.update(connection!.id, {
          name: name.trim(),
          ...(uri.trim() ? { uri: uri.trim() } : {}),
          defaultDatabase: defaultDatabase.trim() || undefined,
          color,
          readOnly,
          notes: notes.trim() || undefined,
        })
        toast.success('Connection profile updated')
      } else {
        await api.connections.create({
          name: name.trim(),
          uri: uri.trim(),
          defaultDatabase: defaultDatabase.trim() || undefined,
          color,
          readOnly,
          notes: notes.trim() || undefined,
        })
        toast.success('Connection profile created')
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save connection')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Connection Profile' : 'New MongoDB Connection'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update connection profile settings. Leave URI blank to keep current secret.'
                : 'Enter your MongoDB instance or Atlas cluster URI.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Profile Name</Label>
              <Input
                id="name"
                placeholder="e.g. Production Cluster, Local Docker"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="uri">
                Connection URI {isEdit && <span className="text-xs text-muted-foreground">(optional to change)</span>}
              </Label>
              <Input
                id="uri"
                type="password"
                placeholder="mongodb+srv://user:pass@cluster.mongodb.net/dbname"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                required={!isEdit}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="defaultDatabase">Default Database</Label>
                <Input
                  id="defaultDatabase"
                  placeholder="Optional DB"
                  value={defaultDatabase}
                  onChange={(e) => setDefaultDatabase(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="color">Badge Color</Label>
                <Select value={color} onValueChange={(val: string | null) => setColor(val || 'amber')}>
                  <SelectTrigger id="color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full bg-${c}-500`} />
                          <span className="capitalize">{c}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Read-Only Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Prevent accidental document mutations or drops from the console.
                </p>
              </div>
              <Switch checked={readOnly} onCheckedChange={setReadOnly} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes or tags..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || (!uri && !isEdit)}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Profile'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
