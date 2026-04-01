import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FormShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function FormShell({ title, description, children }: FormShellProps) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-3xl">{title}</CardTitle>
        <p className="text-sm leading-7 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
