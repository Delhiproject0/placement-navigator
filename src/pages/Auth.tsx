import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { signInSchema, signUpSchema } from "@/lib/schemas";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type Mode = "signin" | "signup" | "forgot";

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { full_name: "", email: "", password: "" },
  });

  const forgotForm = useForm<{ email: string }>({ defaultValues: { email: "" } });

  /**
   * The API returns a stable `code`; a 422 also carries per-field messages.
   * Attaching those to the field is what stops a form telling you only that
   * "something" was wrong.
   */
  const handleFailure = (error: unknown, form?: ReturnType<typeof useForm>) => {
    if (error instanceof ApiError) {
      if (error.details && form) {
        for (const [field, message] of Object.entries(error.details)) {
          form.setError(field as never, { message });
        }
      }
      setFormError(error.message);
      return;
    }
    setFormError("Could not reach the server. Check your connection and try again.");
  };

  const onSignIn = signInForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      toast.success("Welcome back");
      navigate("/", { replace: true });
    } catch (error) {
      handleFailure(error);
    }
  });

  const onSignUp = signUpForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp(values.email, values.password, values.full_name);
      toast.success("Account created");
      navigate("/", { replace: true });
    } catch (error) {
      handleFailure(error);
    }
  });

  const onForgot = forgotForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const response = await api.auth.requestReset(values.email);
      // Deliberately the same message whether or not the address exists.
      toast.success(response.message);
      setMode("signin");
    } catch (error) {
      handleFailure(error);
    }
  });

  const busy =
    signInForm.formState.isSubmitting ||
    signUpForm.formState.isSubmitting ||
    forgotForm.formState.isSubmitting;

  const heading =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create an account" : "Reset password";
  const subheading =
    mode === "signin"
      ? "Sign in to contribute experiences and track your applications."
      : mode === "signup"
        ? "Anyone with an account can share interview experiences."
        : "We will send a reset link to your registered address.";

  return (
    <Layout withFooter={false}>
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12">
        <div className="bg-dot-grid absolute inset-0 opacity-60" aria-hidden />
        <div
          className="absolute left-1/2 top-1/4 h-80 w-80 -translate-x-1/2 rounded-[999px] bg-primary/10 blur-3xl"
          aria-hidden
        />

        <div className="relative w-full max-w-[26rem]">
          <div className="rounded-xl border border-border bg-card p-7 shadow-lg sm:p-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subheading}</p>

            {formError && (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {mode === "signin" && (
              <form onSubmit={onSignIn} className="mt-6 space-y-4" noValidate>
                <Field label="Email" id="signin-email" error={signInForm.formState.errors.email?.message}>
                  <Input id="signin-email" type="email" autoComplete="email" {...signInForm.register("email")} />
                </Field>
                <Field
                  label="Password"
                  id="signin-password"
                  error={signInForm.formState.errors.password?.message}
                >
                  <div className="relative">
                    <Input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-10"
                      {...signInForm.register("password")}
                    />
                    <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </Field>

                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setFormError(null);
                  }}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot your password?
                </button>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={onSignUp} className="mt-6 space-y-4" noValidate>
                <Field label="Full name" id="signup-name" error={signUpForm.formState.errors.full_name?.message}>
                  <Input id="signup-name" autoComplete="name" {...signUpForm.register("full_name")} />
                </Field>
                <Field label="Email" id="signup-email" error={signUpForm.formState.errors.email?.message}>
                  <Input id="signup-email" type="email" autoComplete="email" {...signUpForm.register("email")} />
                </Field>
                <Field
                  label="Password"
                  id="signup-password"
                  hint="At least 8 characters. A short phrase is stronger than a scrambled word."
                  error={signUpForm.formState.errors.password?.message}
                >
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className="pr-10"
                      {...signUpForm.register("password")}
                    />
                    <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={onForgot} className="mt-6 space-y-4" noValidate>
                <Field label="Email" id="forgot-email">
                  <Input id="forgot-email" type="email" autoComplete="email" {...forgotForm.register("email")} />
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMode("signin");
                    setFormError(null);
                  }}
                >
                  Back to sign in
                </Button>
              </form>
            )}

            {mode !== "forgot" && (
              <p className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New here? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setFormError(null);
                  }}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            <Link to="/companies" className="underline-offset-4 hover:underline">
              Browse companies without an account
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
};

interface FieldProps {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

/**
 * Wrapper only - the caller renders the input itself.
 *
 * Taking `{...register(...)}` as props would silently break the form: `ref` is
 * not an ordinary prop, so React would attach it to this component instead of
 * the underlying input and react-hook-form would never see any value.
 */
const Field = ({ label, id, error, hint, children }: FieldProps) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    {error && (
      <p id={`${id}-error`} className="text-xs text-destructive">
        {error}
      </p>
    )}
  </div>
);

const PasswordToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={show ? "Hide password" : "Show password"}
    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
  >
    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
);

export default Auth;
