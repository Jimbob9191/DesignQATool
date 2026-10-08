import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

const emailField = z.string().trim().email("Enter a valid email address");

// Shared by every form that sets a password (post-signup setup, reset, change) so the rule can
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

// Email only: the password is chosen after the confirmation link is clicked.
// Taking it up front would let anyone who signs up with an address they don't
// own pick the password the real owner then unknowingly confirms.
export const signUpSchema = z.object({
  email: emailField,
});

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

// Changing the password from settings: unlike the reset form, the session alone
// isn't proof enough (it could be a laptop left unlocked), so the current
// password is required too.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .refine(passwordsMatch, mismatchError())
  .refine((values) => values.password !== values.currentPassword, {
    message: "Choose a password different from your current one",
    path: ["password"],
  });

export type SignInSchema = z.infer<typeof signInSchema>;
export type SignUpSchema = z.infer<typeof signUpSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;
