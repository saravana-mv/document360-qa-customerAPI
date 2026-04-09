import { type ReactNode } from "react";
import { TopBar } from "./TopBar";

interface LayoutProps {
  children: ReactNode;
  showTestControls?: boolean;
}

export function Layout({ children, showTestControls }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <TopBar showTestControls={showTestControls} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
