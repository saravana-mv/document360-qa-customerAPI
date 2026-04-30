const METHOD_STYLES: Record<string, string> = {
  get: "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]",
  post: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  put: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  patch: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  delete: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
};

export function MethodBadge({ method, size = "sm" }: { method: string; size?: "sm" | "xs" }) {
  const cls = METHOD_STYLES[method.toLowerCase()] ?? "bg-[#f6f8fa] text-[#656d76] border-[#d1d9e0]";
  const sizeClass = size === "xs"
    ? "text-[9px] px-1.5 py-[1px] min-w-[36px]"
    : "text-[10px] px-2 py-[2px] min-w-[42px]";
  return (
    <span className={`font-bold uppercase text-center rounded border inline-block leading-tight ${cls} ${sizeClass}`}>
      {method.toUpperCase()}
    </span>
  );
}
