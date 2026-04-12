import { type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SideNav } from "./SideNav";
import { useAuthStore } from "../../store/auth.store";

interface LayoutProps {
  children: ReactNode;
  showTestControls?: boolean;
}

export function Layout({ children, showTestControls }: LayoutProps) {
  const { status } = useAuthStore();
  const showNav = status === "authenticated" || status === "authenticating";

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f8fa]">
      {showNav && <SideNav />}
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar showTestControls={showTestControls} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
