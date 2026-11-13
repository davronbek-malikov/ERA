import { cn } from "@/lib/utils";

type SectionProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
};

// Vertical rhythm for public pages: 32px on phones, 48px from tablet up (--section-padding).
// It's a variable, so a caller's own py-*/pt-*/pb-* classes override it at every width.
export function Section({ children, className, id }: SectionProps) {
  return (
    <section id={id} className={cn("py-[var(--section-padding)]", className)}>
      {children}
    </section>
  );
}
