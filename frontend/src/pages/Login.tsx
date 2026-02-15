import { useForm } from '@tanstack/react-form'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '@/hooks'
import { logger } from '@/lib/logger'
import { loginSchema } from '@/lib/validations'

function getFieldErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return String(error)
}

export default function Login() {
  const [showPassword, setShowPassword] = useState(false)

  const loginMutation = useLogin()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        setServerError(null)
        await loginMutation.mutateAsync(value)
        toast.success('Successfully logged in!')
      } catch (error) {
        logger.error('Login error:', error)
        const message =
          error instanceof Error ? error.message : 'Invalid email or password'
        toast.error(message)
        setServerError(message)
      }
    },
  })

  return (
    <AuthLayout
      title='Welcome back'
      description='Enter your credentials to access your account'
    >
      <form
        onSubmit={e => {
          e.preventDefault()
          e.stopPropagation()
          void form.handleSubmit()
        }}
        className='space-y-4'
      >
        {serverError && (
          <div className='bg-destructive/15 p-3 rounded-md flex items-center gap-2 text-sm text-destructive'>
            <AlertCircle className='w-4 h-4 shrink-0' />
            <p>{serverError}</p>
          </div>
        )}

        <form.Field name='email'>
          {field => {
            const errorMessage = getFieldErrorMessage(
              field.state.meta.errors[0]
            )
            return (
              <div className='space-y-2'>
                <Label htmlFor='email'>Email</Label>
                <Input
                  id='email'
                  type='email'
                  placeholder='Enter your email'
                  value={field.state.value as string}
                  onChange={e => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                {errorMessage && (
                  <p className='text-sm text-red-600'>{errorMessage}</p>
                )}
              </div>
            )
          }}
        </form.Field>

        <form.Field name='password'>
          {field => {
            const errorMessage = getFieldErrorMessage(
              field.state.meta.errors[0]
            )
            return (
              <div className='space-y-2'>
                <Label htmlFor='password'>Password</Label>
                <div className='relative'>
                  <Input
                    id='password'
                    type={showPassword ? 'text' : 'password'}
                    placeholder='Enter your password'
                    value={field.state.value as string}
                    onChange={e => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className='h-4 w-4' />
                    ) : (
                      <Eye className='h-4 w-4' />
                    )}
                  </Button>
                </div>
                {errorMessage && (
                  <p className='text-sm text-red-600'>{errorMessage}</p>
                )}
              </div>
            )
          }}
        </form.Field>

        <form.Subscribe selector={s => [s.isSubmitting]}>
          {([isSubmitting]) => (
            <Button
              type='submit'
              className='w-full'
              disabled={isSubmitting || loginMutation.isPending}
            >
              {isSubmitting || loginMutation.isPending ? (
                'Signing in...'
              ) : (
                <>
                  <LogIn className='w-4 h-4 mr-2' />
                  Sign In
                </>
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className='mt-6 text-center text-sm'>
        <span className='text-muted-foreground'>Don't have an account? </span>
        <Link to='/signup' className='text-primary hover:underline font-medium'>
          Sign up
        </Link>
      </div>

      <div className='mt-4 text-center'>
        <Button
          variant='link'
          className='text-sm text-muted-foreground'
          disabled
          title='Coming soon'
        >
          Forgot your password?
        </Button>
      </div>
    </AuthLayout>
  )
}
