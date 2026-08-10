import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, TriangleAlert } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so a single bad row cannot blank the whole app.
 *
 * There was no boundary at all, so any throw during render - an unmapped
 * status, a null company, a malformed date - produced a white screen with the
 * detail only visible in the console.
 *
 * Must be a class: there is still no hook equivalent of componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-destructive/25 bg-destructive/10">
            <TriangleAlert className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold">Something broke</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page hit an error it could not recover from on its own.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-left font-mono text-2xs text-muted-foreground">
            {error.message}
          </pre>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={this.reset} variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Button onClick={() => window.location.assign("/")}>Go home</Button>
          </div>
        </div>
      </div>
    );
  }
}
