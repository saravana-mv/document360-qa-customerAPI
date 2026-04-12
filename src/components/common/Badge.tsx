interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "error" | "warn" | "info";
  size?: "sm" | "md";
}

const variantClass = {
  default: "bg-[#eef1f6] text-[#656d76] border-[#d1d9e0]",
  success: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  error: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
  warn: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  info: "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]",
};

export function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  const sizeClass = size === "sm" ? "px-[6px] py-[1px] text-[11px]" : "px-2.5 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center rounded-full font-medium border ${sizeClass} ${variantClass[variant]}`}>
      {children}
    </span>
  );
}
