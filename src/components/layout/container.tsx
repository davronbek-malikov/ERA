import { cn } from "@/lib/utils";

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
  /** "default" is the 1200px content width; "narrow" (720px) is for forms and reading. */
  width?: "default" | "narrow";
};

export function Container({ children, className, width = "default" }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 md:px-6 lg:px-8",
        width === "narrow" ? "max-w-narrow" : "max-w-content",
        className
      )}
    >
      {children}
    </div>
  );
}
