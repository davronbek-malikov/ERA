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
      <div className="space-y-3">
        <h1 className="page-title max-w-4xl">{title}</h1>
        <p className="page-lead max-w-3xl">{description}</p>
      </div>
    </div>
  );
}
