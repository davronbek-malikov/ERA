import { Badge } from "@/components/ui/badge";

type AdminPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function AdminPageHeader({ eyebrow, title, description }: AdminPageHeaderProps) {
  return (
    <div className="space-y-4">
      <Badge variant="outline">{eyebrow}</Badge>
      <div className="space-y-2">
        <h1 className="font-display text-5xl leading-tight">{title}</h1>
        <p className="max-w-3xl text-base leading-8 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
