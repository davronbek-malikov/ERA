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
    <div className={cn("space-y-5", align === "center" && "mx-auto max-w-3xl text-center")}>
      <Badge variant="outline" className="w-fit">
        {eyebrow}
      </Badge>
      <div className="space-y-3">
        <h2 className="font-display text-3xl font-semibold leading-[1.08] text-balance sm:text-4xl lg:text-[2.8rem]">
          {title}
        </h2>
        <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
          {description}
        </p>
      </div>
    </div>
  );
}
