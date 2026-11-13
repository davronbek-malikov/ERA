import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left"
}: SectionHeadingProps) {
  return (
    <div className={cn("space-y-4 sm:space-y-5", align === "center" && "mx-auto max-w-3xl text-center")}>
      <Badge variant="outline" className="w-fit">
        {eyebrow}
      </Badge>
      <div className="space-y-3">
        <h2 className="section-title">{title}</h2>
        <p className="section-copy">{description}</p>
      </div>
    </div>
  );
}
