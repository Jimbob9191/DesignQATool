import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

const emailField = z.string().trim().email("Enter a valid email address");

// Sign-in only checks that a password was typed. The length rule belongs on
// signup — enforcing it here would lock out any account created before the
// minimum changed, and it leaks the rule to someone guessing credentials.
export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z
  .object({
    email: emailField,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
    confirmPassword: z.string().min(1, "Re-enter your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignInSchema = z.infer<typeof signInSchema>;
export type SignUpSchema = z.infer<typeof signUpSchema>;
