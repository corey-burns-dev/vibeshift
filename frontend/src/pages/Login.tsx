import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '@/hooks'
import { logger } from '@/lib/logger'
import { type LoginFormData, loginSchema } from '@/lib/validations'

export default function Login() {
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const loginMutation = useLogin()

  const onSubmit = async (data: LoginFormData) => {
    try {
      await loginMutation.mutateAsync(data)
      toast.success('Successfully logged in!')
    } catch (error) {
      logger.error('Login error:', error)
      const message =
        error instanceof Error ? error.message : 'Invalid email or password'
      toast.error(message)
      setError('root', {
        message: message,
      })
    }
  }

  return (
    <AuthLayout
      title='Welcome back'
      description='Enter your credentials to access your account'
    >
      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        {errors.root && (
          <div className='bg-destructive/15 p-3 rounded-md flex items-center gap-2 text-sm text-destructive'>
            <AlertCircle className='w-4 h-4 shrink-0' />
            <p>{errors.root.message}</p>
          </div>
        )}
        <div className='space-y-2'>
          <Label htmlFor='email'>Email</Label>
          <Input
            id='email'
            type='email'
            placeholder='Enter your email'
            {...register('email')}
          />
          {errors.email && (
            <p className='text-sm text-red-600'>{errors.email.message}</p>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='password'>Password</Label>
          <div className='relative'>
            <Input
              id='password'
              type={showPassword ? 'text' : 'password'}
              placeholder='Enter your password'
              {...register('password')}
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className='h-4 w-4' />
              ) : (
                <Eye className='h-4 w-4' />
              )}
            </Button>
          </div>
          {errors.password && (
            <p className='text-sm text-red-600'>{errors.password.message}</p>
          )}
        </div>
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
