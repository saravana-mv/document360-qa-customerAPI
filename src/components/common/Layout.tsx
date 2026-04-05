import { type ReactNode } from "react";
import { TopBar } from "./TopBar";

interface LayoutProps {
  children: ReactNode;
  showTestControls?: boolean;
  onCheckChanges?: () => void;
  onRunSelected?: () => void;
}

export function Layout({ children, showTestControls, onCheckChanges, onRunSelected }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <TopBar
        showTestControls={showTestControls}
        onCheckChanges={onCheckChanges}
        onRunSelected={onRunSelected}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
