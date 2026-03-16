"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const OTP_LENGTH = 8;
const RESEND_COOLDOWN = 30;

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Auto-focus first OTP input when step changes
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [step]);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required");
      return;
    }

    if (trimmed.toLowerCase() === "prathambhonge@gmail.com") {
      alert("ur gay");
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: trimmed,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setStep("otp");
      setCooldown(RESEND_COOLDOWN);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return;
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setCooldown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }

  const submitOtp = useCallback(
    async (code: string) => {
      if (code.length !== OTP_LENGTH || loading) return;
      setError(null);
      setLoading(true);

      try {
        const supabase = getSupabaseBrowser();
        const { error: authError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: "email",
        });

        if (authError) {
          if (authError.message.toLowerCase().includes("expired")) {
            setError("Code expired. Please request a new one.");
          } else if (authError.message.toLowerCase().includes("invalid")) {
            setError("Invalid code. Check your email and try again.");
          } else {
            setError(authError.message);
          }
          return;
        }

        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("Verification failed. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, loading, router]
  );

  function handleDigitChange(index: number, value: string) {
    // Handle paste across all fields
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (pasted.length > 0) {
        const newDigits = Array(OTP_LENGTH).fill("");
        for (let i = 0; i < pasted.length; i++) {
          newDigits[i] = pasted[i];
        }
        setDigits(newDigits);
        const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
        if (pasted.length === OTP_LENGTH) {
          submitOtp(pasted);
        }
        return;
      }
    }

    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const code = newDigits.join("");
    if (code.length === OTP_LENGTH) {
      submitOtp(code);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    const newDigits = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();

    if (pasted.length === OTP_LENGTH) {
      submitOtp(pasted);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block"
        >
          &larr; Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">
          {step === "email" ? "Sign in" : "Enter your code"}
        </h1>
        <p className="text-zinc-400 text-sm mb-8">
          {step === "email"
            ? "Enter your email to sign in or create an account."
            : `We sent an 8-digit code to ${email}`}
        </p>

        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              disabled={loading}
            />

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                "Send Code"
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  maxLength={1}
                  disabled={loading}
                  className="w-8 h-11 text-center text-lg font-mono rounded-lg bg-zinc-900 border border-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-50 sm:w-10 sm:h-12 sm:text-xl"
                />
              ))}
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying...
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setDigits(Array(OTP_LENGTH).fill(""));
                  setError(null);
                }}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                &larr; Change email
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="text-sm text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : "Resend code"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
