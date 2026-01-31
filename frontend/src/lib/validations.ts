import { z } from 'zod'

// Auth schemas
export const loginSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = z
    .object({
        username: z
            .string()
            .min(3, 'Username must be at least 3 characters')
            .max(20, 'Username must be less than 20 characters')
            .regex(
                /^[a-zA-Z0-9_]+$/,
                'Username can only contain letters, numbers, and underscores'
            ),
        email: z.string().email('Please enter a valid email address'),
        password: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                'Password must contain at least one uppercase letter, one lowercase letter, and one number'
            ),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    })

// Post schemas
export const createPostSchema = z.object({
    title: z
        .string()
        .min(1, 'Title is required')
        .max(100, 'Title must be less than 100 characters'),
    content: z
        .string()
        .min(1, 'Content is required')
        .max(5000, 'Content must be less than 5000 characters'),
    image_url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
})

// Comment schemas
export const createCommentSchema = z.object({
    content: z
        .string()
        .min(1, 'Comment cannot be empty')
        .max(1000, 'Comment must be less than 1000 characters'),
})

// Profile schemas
export const updateProfileSchema = z.object({
    username: z
        .string()
        .min(3, 'Username must be at least 3 characters')
        .max(20, 'Username must be less than 20 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
        .optional(),
    bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
    avatar: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
})

// Chat schemas
export const createConversationSchema = z.object({
    participant_ids: z.array(z.number()).min(1, 'At least one participant is required'),
    is_group: z.boolean().optional(),
    name: z.string().optional(),
    avatar: z.string().url().optional(),
})

export const sendMessageSchema = z.object({
    content: z
        .string()
        .min(1, 'Message cannot be empty')
        .max(2000, 'Message must be less than 2000 characters'),
    message_type: z.enum(['text', 'image', 'file']).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

// Search schemas
export const searchParamsSchema = z.object({
    q: z.string().min(1, 'Search query is required'),
    offset: z.number().min(0).optional(),
    limit: z.number().min(1).max(100).optional(),
})

// Type exports
export type LoginFormData = z.infer<typeof loginSchema>
export type SignupFormData = z.infer<typeof signupSchema>
export type CreatePostFormData = z.infer<typeof createPostSchema>
export type CreateCommentFormData = z.infer<typeof createCommentSchema>
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>
export type CreateConversationFormData = z.infer<typeof createConversationSchema>
export type SendMessageFormData = z.infer<typeof sendMessageSchema>
export type SearchParamsData = z.infer<typeof searchParamsSchema>
