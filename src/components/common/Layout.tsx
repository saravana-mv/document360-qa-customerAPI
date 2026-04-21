import { type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SideNav } from "./SideNav";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  // SideNav is always shown — the outer Entra gate already keeps unauth'd
  // users out of the app entirely.
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f6f8fa]">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <SideNav />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
