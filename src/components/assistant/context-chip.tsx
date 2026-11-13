import { BookOpen, Clock3, FileText, FunctionSquare, GraduationCap, LayoutGrid, Quote, X } from "lucide-react";

import type { AssistantContextChip, ContextChipKind } from "@/components/assistant/types";
import { cn } from "@/lib/utils";

const icons: Record<ContextChipKind, React.ReactNode> = {
  course: <GraduationCap aria-hidden="true" />,
  lesson: <BookOpen aria-hidden="true" />,
  notes: <FileText aria-hidden="true" />,
  timestamp: <Clock3 aria-hidden="true" />,
  selection: <Quote aria-hidden="true" />,
  formula: <FunctionSquare aria-hidden="true" />,
  material: <FileText aria-hidden="true" />,
  submission: <FileText aria-hidden="true" />,
  page: <LayoutGrid aria-hidden="true" />
};

export function ContextChip({
  chip,
  onRemove,
  removeLabel = "Remove"
}: {
  chip: AssistantContextChip;
  onRemove?: (id: string) => void;
  removeLabel?: string;
}) {
  const removable = chip.removable && onRemove;

  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-[14rem] items-center gap-1 rounded-md border border-border bg-surface px-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        removable && "pr-0.5"
      )}
    >
      {icons[chip.kind]}
      <span className="truncate">{chip.label}</span>
      {removable ? (
        <button
          type="button"
          onClick={() => onRemove(chip.id)}
          className="-mr-0.5 flex size-6 items-center justify-center rounded hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${removeLabel}: ${chip.label}`}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
