import { PageHeader } from "@/components/layout/page-header";

type AdminPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

// Kept for existing admin pages; renders the shared PageHeader.
export function AdminPageHeader({ eyebrow, title, description }: AdminPageHeaderProps) {
  return <PageHeader eyebrow={eyebrow} title={title} description={description} />;
}
