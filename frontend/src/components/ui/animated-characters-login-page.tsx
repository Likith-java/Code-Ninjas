"use client";

import { useState, useEffect, useRef } from "react";
import { Button, Card } from "@/components/ui";
import { MaterialIcon } from "@/components/ui/MaterialIcon";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { saveSession, getToken } from "@/lib/auth-storage";
import { useRouter } from "next/navigation";

interface AuthPageProps {
  isStandalone?: boolean;
}

const ROLE_OPTIONS = [
  { label: "Production Planner", value: "planner" },
  { label: "Storekeeper", value: "storekeeper" },
  { label: "Shift Supervisor / Operator", value: "supervisor" },
  { label: "Quality Inspector", value: "inspector" },
];

export function AuthPage({ isStandalone = false }: AuthPageProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("supervisor");

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsClient(true);
    const handleFocus = () => setIsTyping(true);
    const handleBlur = () => setIsTyping(false);
    
    const inputs = [nameRef, emailRef, passwordRef, confirmPasswordRef].filter(Boolean) as React.RefObject<HTMLInputElement>[];
    inputs.forEach(ref => {
      ref.current?.addEventListener('focus', handleFocus);
      ref.current?.addEventListener('blur', handleBlur);
    });
    
    return () => {
      inputs.forEach(ref => {
        ref.current?.removeEventListener('focus', handleFocus);
        ref.current?.removeEventListener('blur', handleBlur);
      });
    };
  }, []);

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "login") {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Please enter your email address.");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setError("Please enter a valid email format.");
        return;
      }
      if (!password) {
        setError("Please enter your password.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.login({ email: trimmedEmail, password });
        saveSession(response.token, response.user);
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    } else {
      if (!name.trim()) {
        setError("Please enter your full name.");
        return;
      }
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Please enter your email address.");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setError("Please enter a valid email format.");
        return;
      }
      if (!password) {
        setError("Please enter a password.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.register({
          name: name.trim(),
          email: trimmedEmail,
          password,
          role,
        });
        saveSession(response.token, response.user);
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const containerClasses = isStandalone
    ? "w-full min-h-screen flex items-center justify-center p-4 bg-[#F5F0E3] select-none font-body text-[13px]"
    : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#181816]/60 backdrop-blur-xs select-none font-body text-[13px]";

  const headerTitle = mode === "login" ? "Welcome back!" : "Create your account";
  const headerSubtitle = mode === "login"
    ? "Please enter your details to access the mill's shared records"
    : "Set up access to the mill's shared records";

  return (
    <div className={containerClasses}>
      <div className="w-full max-w-md bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl pop-shadow-xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="p-4 sm:p-6 bg-white border-b-2 border-[#181816] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 bg-[#0E4B3E] text-white rounded-xl border-2 border-[#181816] pop-shadow-xs flex items-center justify-center font-mono text-base font-bold">
              ET
            </span>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-[#181816] leading-none">
                Everest Textile Mills
              </h2>
              <p className="font-mono text-xs text-stone-500 mt-0.5">
                Production Intelligence Platform
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          <div className="text-center space-y-1">
            <h3 className="font-bold text-lg text-[#181816]">{headerTitle}</h3>
            <p className="font-mono text-xs text-stone-500">{headerSubtitle}</p>
          </div>

          <div className="flex gap-2 bg-[#E7DFCE] p-1 rounded-2xl border-2 border-[#181816]">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all",
                mode === "login"
                  ? "bg-white text-[#0E4B3E] pop-shadow-xs border-2 border-[#181816]"
                  : "text-stone-600 hover:text-[#181816]"
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all",
                mode === "signup"
                  ? "bg-white text-[#0E4B3E] pop-shadow-xs border-2 border-[#181816]"
                  : "text-stone-600 hover:text-[#181816]"
              )}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="signup-name"
                  className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
                >
                  Full Name
                </label>
                <input
                  ref={nameRef}
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                  autoComplete="name"
                  autoFocus
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
              >
                Email Address
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="operator@everest-textile.com"
                className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
              >
                Password
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 pr-10 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-[#181816]"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} size="sm" />
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    ref={confirmPasswordRef}
                    id="signup-confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 pr-10 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                    autoComplete="new-password"
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 font-mono text-xs text-[#E05326]">Passwords do not match</p>
                )}
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="signup-role"
                  className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
                >
                  Role
                </label>
                <select
                  id="signup-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-stone-500">
                  Owner & Accounts roles are assigned by administrators only.
                </p>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl border-2 border-[#E05326] bg-[#FFEFEA] text-[#962C0B] font-mono text-xs flex items-center gap-2">
                <MaterialIcon name="error" size="sm" color="#E05326" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isLoading}
                className="w-full justify-center text-xs font-bold"
                icon={
                  isLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  ) : (
                    <MaterialIcon name={mode === "login" ? "login" : "person_add"} size="sm" />
                  )
                }
              >
                {isLoading
                  ? mode === "login"
                    ? "Signing In..."
                    : "Creating Account..."
                  : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </Button>
            </div>
          </form>
        </div>

        {/* <div className="p-3 bg-[#E7DFCE] border-t-2 border-[#181816] text-center font-mono text-[10px] text-stone-600">
          Everest Textile Mills · Production Intelligence Platform
        </div> */}
      </div>
    </div>
  );
}