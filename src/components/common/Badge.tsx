interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "error" | "warn" | "info";
  size?: "sm" | "md";
}

const variantClass = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  warn: "bg-yellow-100 text-yellow-800",
  info: "bg-blue-100 text-blue-800",
};

export function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${variantClass[variant]}`}>
      {children}
    </span>
  );
}
