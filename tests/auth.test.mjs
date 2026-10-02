import assert from "node:assert/strict";
import test from "node:test";

import {
  fieldErrorsFrom,
  friendlyAuthError,
  initialAuthState,
  safeNext,
  submittedEmail,
} from "../src/lib/auth/form-state.ts";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  PASSWORD_MIN_LENGTH,
} from "../src/lib/validations/auth.ts";
import {
  commentNotificationEmail,
  escapeHtml,
  invitationEmail,
  passwordResetEmail,
  signupConfirmationEmail,
} from "../src/lib/email/templates.ts";

test("initialAuthState starts idle with no messages", () => {
  assert.deepEqual(initialAuthState, { status: "idle" });
});

test("safeNext allows same-origin paths", () => {
  assert.equal(safeNext("/projects/abc"), "/projects/abc");
  assert.equal(safeNext("/invite/accept?token=xyz"), "/invite/accept?token=xyz");
});

test("safeNext falls back to /dashboard for missing or non-string values", () => {
  assert.equal(safeNext(null), "/dashboard");
  assert.equal(safeNext(undefined), "/dashboard");
  assert.equal(safeNext(""), "/dashboard");
  assert.equal(safeNext(42), "/dashboard");
});

test("safeNext rejects off-site redirects", () => {
  assert.equal(safeNext("//evil.com"), "/dashboard", "protocol-relative URL must be rejected");
  assert.equal(safeNext("https://evil.com"), "/dashboard");
  assert.equal(safeNext("http://evil.com/path"), "/dashboard");
  assert.equal(safeNext("javascript:alert(1)"), "/dashboard");
  assert.equal(safeNext("/\\evil.com"), "/dashboard", "browsers treat /\\ like //");
});

test("friendlyAuthError rewrites developer-facing Supabase messages", () => {
  assert.equal(
    friendlyAuthError({ message: "Invalid login credentials", status: 400 }),
    "That email or password is incorrect."
  );
  assert.match(friendlyAuthError({ message: "Email not confirmed", status: 400 }), /needs confirming/);
  assert.match(friendlyAuthError({ message: "anything", status: 429 }), /Too many attempts/);
  assert.match(friendlyAuthError({ message: "fetch failed" }), /Can't reach the authentication service/);
});

test("friendlyAuthError passes through messages it does not recognise", () => {
  assert.equal(friendlyAuthError({ message: "Signups not allowed", status: 422 }), "Signups not allowed");
});

test("submittedEmail trims the raw value and tolerates non-strings", () => {
  assert.equal(submittedEmail("  user@example.com "), "user@example.com");
  assert.equal(submittedEmail(null), "");
  assert.equal(submittedEmail(undefined), "");
  assert.equal(submittedEmail(123), "");
});

test("signInSchema accepts valid credentials and trims the email", () => {
  const result = signInSchema.safeParse({ email: "  user@example.com ", password: "hunter2" });
  assert.equal(result.success, true);
  assert.equal(result.data.email, "user@example.com");
});

test("signInSchema rejects a bad email and an empty password", () => {
  const badEmail = signInSchema.safeParse({ email: "nope", password: "hunter2" });
  assert.equal(badEmail.success, false);
  assert.equal(fieldErrorsFrom(badEmail.error).email, "Enter a valid email address");

  const noPassword = signInSchema.safeParse({ email: "user@example.com", password: "" });
  assert.equal(noPassword.success, false);
  assert.equal(fieldErrorsFrom(noPassword.error).password, "Enter your password");
});

test("signInSchema does NOT enforce the signup length minimum", () => {
  const result = signInSchema.safeParse({ email: "user@example.com", password: "short" });
  assert.equal(result.success, true, "existing short passwords must still be able to sign in");
});

test("signUpSchema accepts a valid matching pair", () => {
  const result = signUpSchema.safeParse({
    email: "new@example.com",
    password: "correct-horse",
    confirmPassword: "correct-horse",
  });
  assert.equal(result.success, true);
});

test("signUpSchema enforces the minimum password length", () => {
  const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
  const result = signUpSchema.safeParse({
    email: "new@example.com",
    password: short,
    confirmPassword: short,
  });
  assert.equal(result.success, false);
  assert.match(fieldErrorsFrom(result.error).password, /at least 8 characters/);
});

test("signUpSchema rejects mismatched passwords on the confirm field", () => {
  const result = signUpSchema.safeParse({
    email: "new@example.com",
    password: "correct-horse",
    confirmPassword: "correct-horsf",
  });
  assert.equal(result.success, false);
  assert.equal(fieldErrorsFrom(result.error).confirmPassword, "Passwords do not match");
});

test("forgotPasswordSchema accepts and trims an email, and asks for nothing else", () => {
  const result = forgotPasswordSchema.safeParse({ email: "  user@example.com " });
  assert.equal(result.success, true);
  assert.equal(result.data.email, "user@example.com");
  assert.deepEqual(Object.keys(result.data), ["email"]);
});

test("forgotPasswordSchema rejects a malformed email", () => {
  const result = forgotPasswordSchema.safeParse({ email: "nope" });
  assert.equal(result.success, false);
  assert.equal(fieldErrorsFrom(result.error).email, "Enter a valid email address");
});

test("resetPasswordSchema accepts a valid matching pair with no email field", () => {
  const result = resetPasswordSchema.safeParse({
    password: "correct-horse",
    confirmPassword: "correct-horse",
  });
  assert.equal(result.success, true);
});

test("resetPasswordSchema enforces the same minimum length as signup", () => {
  const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
  const result = resetPasswordSchema.safeParse({ password: short, confirmPassword: short });
  assert.equal(result.success, false);
  assert.match(fieldErrorsFrom(result.error).password, /at least 8 characters/);
});

test("resetPasswordSchema rejects mismatched passwords on the confirm field", () => {
  const result = resetPasswordSchema.safeParse({
    password: "correct-horse",
    confirmPassword: "correct-horsf",
  });
  assert.equal(result.success, false);
  assert.equal(fieldErrorsFrom(result.error).confirmPassword, "Passwords do not match");
});

test("fieldErrorsFrom keeps only the first message per field", () => {
  const result = signUpSchema.safeParse({ email: "nope", password: "x", confirmPassword: "" });
  assert.equal(result.success, false);
  const errors = fieldErrorsFrom(result.error);
  assert.equal(errors.email, "Enter a valid email address");
  assert.ok(errors.password);
  assert.equal(Object.values(errors).every((m) => typeof m === "string"), true);
});

test("escapeHtml neutralises markup in user-supplied text", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')"> & co`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; co"
  );
});

test("signupConfirmationEmail puts the confirm link in both HTML and text bodies", () => {
  const url = "https://qa.example.com/auth/confirm?token_hash=abc&type=signup&next=%2Fdashboard";
  const email = signupConfirmationEmail({ confirmUrl: url });
  assert.match(email.subject, /Confirm your/);
  assert.ok(email.text.includes(url));
  assert.ok(email.html.includes(url.replace(/&/g, "&amp;")), "href must be HTML-escaped");
});

test("passwordResetEmail includes the reset link", () => {
  const url = "https://qa.example.com/auth/confirm?token_hash=abc&type=recovery";
  const email = passwordResetEmail({ resetUrl: url });
  assert.ok(email.text.includes(url));
  assert.ok(email.html.includes(url.replace(/&/g, "&amp;")));
});

test("invitation and comment emails escape user-controlled fields in HTML", () => {
  const invite = invitationEmail({
    inviterLabel: "a@example.com",
    teamName: "<b>Evil</b>",
    role: "member",
    acceptUrl: "https://qa.example.com/invite/accept?token=t",
  });
  assert.ok(!invite.html.includes("<b>Evil</b>"));
  assert.ok(invite.html.includes("&lt;b&gt;Evil&lt;/b&gt;"));

  const comment = commentNotificationEmail({
    authorLabel: "Guest",
    reason: "mention",
    commentBody: '<a href="https://phish.example">click</a>',
    url: "https://qa.example.com/x",
  });
  assert.ok(!comment.html.includes('<a href="https://phish.example">'));
  assert.match(comment.subject, /mentioned you/);
  assert.ok(comment.text.includes('<a href="https://phish.example">click</a>'), "text body stays verbatim");
});
