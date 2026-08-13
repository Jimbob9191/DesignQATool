import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

const emailField = z.string().trim().email("Enter a valid email address");

// Shared by every form that sets a password (signup, reset) so the rule can
// only ever be changed in one place.
const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);

const confirmPasswordField = z.string().min(1, "Re-enter your password");

const passwordsMatch = (values: { password: string; confirmPassword: string }) =>
  values.password === values.confirmPassword;

// Rebuilt per call: Zod mutates nothing here, but `path` is typed mutable, so
// a shared literal can't be reused.
const mismatchError = () => ({ message: "Passwords do not match", path: ["confirmPassword"] });

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
    password: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .refine(passwordsMatch, mismatchError());

export const forgotPasswordSchema = z.object({
  email: emailField,
});

// No current-password field: reaching this form already required proving
// control of the mailbox via the recovery link.
export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .refine(passwordsMatch, mismatchError());

export type SignInSchema = z.infer<typeof signInSchema>;
export type SignUpSchema = z.infer<typeof signUpSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
