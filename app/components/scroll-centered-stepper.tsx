import { useEffect, useRef, type ReactNode } from "react";

/** Horizontale stepper; scrollt de actieve stap naar het midden. */
export function ScrollCenteredStepper({
  activeKey,
  children,
  className = "",
}: {
  activeKey: string;
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[data-active-step="true"]');
    active?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeKey]);

  return (
    <div
      ref={scrollRef}
      className={`overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}
