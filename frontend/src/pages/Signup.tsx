import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSignup } from '@/hooks'
import { type SignupFormData, signupSchema } from '@/lib/validations'

export default function Signup() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })

  const signupMutation = useSignup()

  const onSubmit = async (data: SignupFormData) => {
    try {
      await signupMutation.mutateAsync({
        username: data.username,
        email: data.email,
        password: data.password,
      })
      toast.success('Account created successfully!')
    } catch (error) {
      console.error('Signup error:', error)
      const message =
        error instanceof Error ? error.message : 'Failed to create account'
      toast.error(message)
      setError('root', {
        message: message,
      })
    }
  }

  return (
    <AuthLayout
      title='Create an account'
      description='Join Sanctum and connect with friends'
    >
      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        {errors.root && (
          <div className='bg-destructive/15 p-3 rounded-md flex items-center gap-2 text-sm text-destructive'>
            <AlertCircle className='w-4 h-4 shrink-0' />
            <p>{errors.root.message}</p>
          </div>
        )}
        <div className='space-y-2'>
          <Label htmlFor='username'>Username</Label>
          <Input
            id='username'
            type='text'
            placeholder='johndoe'
            {...register('username')}
          />
          {errors.username && (
            <p className='text-sm text-red-600'>{errors.username.message}</p>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='email'>Email</Label>
          <Input
            id='email'
            type='email'
            placeholder='john@example.com'
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
              placeholder='Create a password'
              {...register('password')}
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
              onClick={() => setShowPassword(!showPassword)}
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

        <div className='space-y-2'>
          <Label htmlFor='confirmPassword'>Confirm Password</Label>
          <div className='relative'>
            <Input
              id='confirmPassword'
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder='Confirm your password'
              {...register('confirmPassword')}
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent'
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (
                <EyeOff className='h-4 w-4' />
              ) : (
                <Eye className='h-4 w-4' />
              )}
            </Button>
          </div>
          {errors.confirmPassword && (
            <p className='text-sm text-red-600'>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

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
