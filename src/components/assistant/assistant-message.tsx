import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type AssistantMessageProps = {
  role: "user" | "assistant";
  /** Assistant display name, for example "ERA Tutor". */
  assistantName?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * User messages are compact bubbles on the right. Assistant answers are full width with
 * no bubble, so structured blocks (steps, formulas, code) have room.
 */
export function AssistantMessage({ role, assistantName = "ERA", children, className }: AssistantMessageProps) {
  if (role === "user") {
    return (
      <div className={cn("flex justify-end", className)}>
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-secondary px-3 py-2 text-sm text-foreground">
          {typeof children === "string" ? <UserText text={children} /> : children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5 text-accent-strong" aria-hidden="true" />
        {assistantName}
      </p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Ask ERA AI turns are stored as "<action>" + a blank line + "> quoted selection". Show the quote as a quote
 * (clamped to a few lines) instead of literal ">" characters. Plain questions render unchanged.
 */
function UserText({ text }: { text: string }) {
  const NL = String.fromCharCode(10);
  const split = text.indexOf(NL + NL + "> ");
  if (split < 0) return <>{text}</>;
  const label = text.slice(0, split);
  const quoteLines: string[] = [];
  const after: string[] = [];
  for (const line of text.slice(split + 2).split(NL)) {
    if (after.length === 0 && line.startsWith(">")) quoteLines.push(line.replace(/^> ?/, ""));
    else after.push(line);
  }
  const trailing = after.join(NL).trim();
  return (
    <>
      {label}
      <span className="mt-1.5 line-clamp-4 block border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">{quoteLines.join(NL)}</span>
      {trailing ? <span className="mt-1 block text-xs text-muted-foreground">{trailing}</span> : null}
    </>
  );
}
