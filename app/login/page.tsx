"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { consumeAuthReturn, getSafeAuthReturn, rememberAuthReturn } from "@/lib/auth-redirect";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [resendWait, setResendWait] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const redirecting = useRef(false);

  function finishSignIn() {
    if (redirecting.current) return;
    redirecting.current = true;
    setPassword("");
    form.current?.reset();
    let saved = "/";
    try {
      saved = consumeAuthReturn(window.sessionStorage);
    } catch {
      // Some browsers block access to sessionStorage entirely.
    }
    const requested = new URLSearchParams(window.location.search).get("next");
    window.location.replace(requested === null ? saved : getSafeAuthReturn(requested));
  }

  useEffect(() => {
    let active = true;
    try {
      const client = getSupabase();
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (active && session) finishSignIn();
      });
      void client.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) setError(errorMessage(error));
          else if (data.session) finishSignIn();
        })
        .catch((e: unknown) => {
          if (active) setError(errorMessage(e));
        });
      const callbackError =
        new URLSearchParams(window.location.hash.slice(1)).get("error_description") ??
        new URLSearchParams(window.location.search).get("error_description");
      if (callbackError) setError(callbackError);
      const element = form.current;
      return () => {
        active = false;
        subscription.unsubscribe();
        // Remove DOM values too; React state is discarded on unmount.
        element?.querySelectorAll("input").forEach((input) => {
          input.value = "";
        });
      };
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (resendWait <= 0) return;
    const id = setTimeout(() => setResendWait((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(id);
  }, [resendWait]);

  function prepareCallback() {
    const next = new URLSearchParams(window.location.search).get("next");
    try {
      if (next !== null) rememberAuthReturn(window.sessionStorage, getSafeAuthReturn(next));
    } catch {
      // Continue authentication with the home page as the callback fallback.
    }
    // Exact callback matches the hosted redirect allowlist (no query string).
    return `${window.location.origin}/login`;
  }

  function reportError(e: unknown) {
    const raw = errorMessage(e);
    const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
    const status = e && typeof e === "object" && "status" in e ? e.status : null;
    let text = raw;
    if (status === 429 || /rate.?limit|too many requests/i.test(`${code} ${raw}`)) {
      setResendWait(120);
      text =
        "Too many requests. Wait at least two minutes before trying again. If email delivery is still limited, try later or contact support.";
    } else if (/invalid login credentials/i.test(raw)) {
      text = "Email or password is incorrect.";
    } else if (/fetch|network/i.test(raw)) {
      text = "Could not connect. Check your connection and try again.";
    }
    if (code === "email_not_confirmed" || /email not confirmed/i.test(raw)) {
      setConfirmationEmail(email.trim());
      text = "Confirm your email before signing in. You can resend the confirmation below.";
    }
    setError(text);
    toast.error(text);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const client = getSupabase();
      const { data, error } = signup
        ? await client.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: prepareCallback() },
          })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword("");
      if (data.session) finishSignIn();
      else {
        setConfirmationEmail(email.trim());
        setResendWait(60);
        setMessage("Check your email to confirm your account. Then sign in if needed.");
        toast.success("Check your email to confirm your account");
      }
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!confirmationEmail || resendWait > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase().auth.resend({
        type: "signup",
        email: confirmationEmail,
        options: { emailRedirectTo: prepareCallback() },
      });
      if (error) throw error;
      setResendWait(60);
      setMessage("Confirmation email sent. Check your inbox and spam folder.");
      toast.success("Confirmation email sent");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: prepareCallback() },
      });
      if (error) throw error;
      setPassword("");
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  }

  return (
    <section className="login">
      <h1>{signup ? "Create an account" : "Sign in"}</h1>
      <p>Save your sketches and publish melodies.</p>
      <form
        ref={form}
        onSubmit={submit}
        aria-describedby={error ? "auth-error" : undefined}
        aria-busy={busy}
      >
        <label htmlFor="auth-email">
          Email
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label htmlFor="auth-password">
          Password
          <input
            key={signup ? "signup" : "login"}
            id="auth-password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            required
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={signup ? "password-help" : undefined}
          />
        </label>
        {signup && <p id="password-help">Use at least 8 characters.</p>}
        <Button disabled={busy || (signup && resendWait > 0)} type="submit">
          {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
        </Button>
        {/* Enable only after configuring Google's client ID/secret in Supabase and its callback URL in Google. No secrets belong in public env vars. */}
        {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && (
          <Button type="button" variant="outline" disabled={busy} onClick={googleSignIn}>
            Continue with Google
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setEmail("");
            setConfirmationEmail("");
            setPassword("");
            setError("");
            setMessage("");
          }}
        >
          {signup ? "Already have an account? Sign in" : "Create an account"}
        </Button>
      </form>
      <p className="form-hint">
        Your browser or password manager may autofill these fields. Fourbars does not save this
        form.
      </p>
      {error && (
        <p id="auth-error" className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!confirmationEmail && resendWait > 0 && <p role="status">Try again in {resendWait}s.</p>}
      {confirmationEmail && (
        <div className="flex flex-col gap-2">
          <p>Confirmation for {confirmationEmail}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy || resendWait > 0}
            onClick={resendConfirmation}
          >
            {resendWait > 0 ? `Resend available in ${resendWait}s` : "Resend confirmation email"}
          </Button>
        </div>
      )}
    </section>
  );
}
