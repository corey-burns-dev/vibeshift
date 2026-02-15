import { useForm } from '@tanstack/react-form'
import { AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSignup } from '@/hooks'
import { logger } from '@/lib/logger'
import { signupSchema } from '@/lib/validations'

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

export default function Signup() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const signupMutation = useSignup()

  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    // Use the Zod schema for form-level validation on submit
    validators: {
      onSubmit: signupSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        setServerError(null)
        await signupMutation.mutateAsync({
          username: value.username,
          email: value.email,
          password: value.password,
        })
        toast.success('Account created successfully!')
        form.reset()
      } catch (error) {
        logger.error('Signup error:', error)
        const message =
          error instanceof Error ? error.message : 'Failed to create account'
        toast.error(message)
        setServerError(message)
      }
    },
  })

  return (
    <AuthLayout
      title='Create an account'
      description='Join Sanctum and connect with friends'
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

        <form.Field name='username'>
          {field => {
            const errorMessage = getFieldErrorMessage(
              field.state.meta.errors[0]
            )
            return (
              <div className='space-y-2'>
                <Label htmlFor='username'>Username</Label>
                <Input
                  id='username'
                  type='text'
                  placeholder='johndoe'
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
                  placeholder='john@example.com'
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
                    placeholder='Create a password'
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

        <form.Field name='confirmPassword'>
          {field => {
            const errorMessage = getFieldErrorMessage(
              field.state.meta.errors[0]
            )
            return (
              <div className='space-y-2'>
                <Label htmlFor='confirmPassword'>Confirm Password</Label>
                <div className='relative'>
                  <Input
                    id='confirmPassword'
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder='Confirm your password'
                    value={field.state.value as string}
                    onChange={e => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showConfirmPassword ? (
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
              disabled={isSubmitting || signupMutation.isPending}
            >
              {isSubmitting || signupMutation.isPending ? (
                'Creating account...'
              ) : (
                <>
                  <UserPlus className='w-4 h-4 mr-2' />
                  Create Account
                </>
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className='mt-6 text-center text-sm'>
        <span className='text-muted-foreground'>Already have an account? </span>
        <Link to='/login' className='text-primary hover:underline font-medium'>
          Sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
