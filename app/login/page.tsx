'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Database,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  Layers,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background" />}>
      <AuthContent />
    </Suspense>
  )
}

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'

  const { login, register, isAuthenticated, isLoading: isAuthLoading } = useAuth()

  const [mode, setMode] = React.useState<'login' | 'register'>(initialMode)
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Form states
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push('/connections')
    }
  }, [isAuthenticated, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'register') {
      if (!name.trim()) {
        setError('Please enter your full name.')
        return
      }
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Please enter a valid email address.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }

      setIsSubmitting(true)
      try {
        await register({ name: name.trim(), email: email.trim(), password })
      } catch (err: any) {
        setError(err.message || 'Registration failed. Please try again.')
      } finally {
        setIsSubmitting(false)
      }
    } else {
      if (!email.trim()) {
        setError('Please enter your email.')
        return
      }
      if (!password) {
        setError('Please enter your password.')
        return
      }

      setIsSubmitting(true)
      try {
        await login({ email: email.trim(), password })
      } catch (err: any) {
        setError(err.message || 'Invalid email or password.')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const toggleMode = (newMode: 'login' | 'register') => {
    setError(null)
    setMode(newMode)
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 bg-background relative overflow-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-teal-500/10 blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
              <Database className="h-6 w-6" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-foreground">
              Mongo Console
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Administer databases, collections, and queries with isolated user workspaces.
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border border-border/80 bg-card/80 backdrop-blur-xl shadow-xl shadow-black/5 dark:shadow-black/40">
          <CardHeader className="pb-4">
            {/* Mode Switcher Tabs */}
            <div className="flex p-1 bg-muted/60 rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => toggleMode('login')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  mode === 'login'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => toggleMode('register')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  mode === 'register'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="pt-3">
              <CardTitle className="text-lg font-semibold">
                {mode === 'login' ? 'Welcome back' : 'Create your workspace'}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {mode === 'login'
                  ? 'Sign in to access your saved MongoDB connection profiles.'
                  : 'Register to manage your own private database connections.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {/* Error Alert */}
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-9 text-sm"
                      required
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 text-sm"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">
                    Password
                  </Label>
                  {mode === 'register' && (
                    <span className="text-[10px] text-muted-foreground">Min. 6 chars</span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9 text-sm font-mono"
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground/60 hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 text-sm font-mono"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || isAuthLoading}
                className="w-full mt-2 font-semibold shadow-md bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-5 text-center text-xs text-muted-foreground">
              {mode === 'login' ? (
                <p>
                  Don&apos;t have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => toggleMode('register')}
                    className="font-medium text-emerald-500 hover:text-emerald-400 hover:underline"
                  >
                    Create one now
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => toggleMode('login')}
                    className="font-medium text-emerald-500 hover:text-emerald-400 hover:underline"
                  >
                    Sign in here
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feature Strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="flex flex-col items-center p-2.5 rounded-lg border border-border/40 bg-card/30 backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-emerald-500 mb-1" />
            <span className="text-[11px] font-semibold text-foreground">Encrypted</span>
            <span className="text-[10px] text-muted-foreground">AES-256 URIs</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg border border-border/40 bg-card/30 backdrop-blur">
            <Layers className="h-4 w-4 text-teal-500 mb-1" />
            <span className="text-[11px] font-semibold text-foreground">Isolated</span>
            <span className="text-[10px] text-muted-foreground">Private profiles</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg border border-border/40 bg-card/30 backdrop-blur">
            <Zap className="h-4 w-4 text-amber-500 mb-1" />
            <span className="text-[11px] font-semibold text-foreground">Real-time</span>
            <span className="text-[10px] text-muted-foreground">Console & Shell</span>
          </div>
        </div>
      </div>
    </div>
  )
}
