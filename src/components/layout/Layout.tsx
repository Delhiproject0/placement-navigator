import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

interface LayoutProps {
  children: ReactNode;
  /** Pages that provide their own footer, or want none, can opt out. */
  withFooter?: boolean;
}

export const Layout = ({ children, withFooter = true }: LayoutProps) => (
  <div className="flex min-h-screen flex-col bg-background">
    <Header />
    {/* flex-1 keeps the footer at the bottom on short pages instead of
        floating it halfway up the viewport. */}
    <main className="flex-1">{children}</main>
    {withFooter && <Footer />}
  </div>
);
