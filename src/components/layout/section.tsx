import { cn } from "@/lib/utils";

type SectionProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
};

export function Section({ children, className, id }: SectionProps) {
  return (
    <section id={id} className={cn("py-12 sm:py-16 lg:py-[4.5rem]", className)}>
      {children}
    </section>
  );
}
