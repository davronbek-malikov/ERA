"use client";

import * as React from "react";

import { CodeBlock, FormulaBlock, TimestampLink } from "@/components/assistant/response-blocks";
import type { Locale } from "@/lib/i18n";

/*
 * Renders tutor answers (plain text with light Markdown) as design-system blocks.
 * It only creates React elements, never HTML strings, so model output can't inject markup.
 */

type Props = { text: string; locale: Locale; onSeek?: (seconds: number) => void };

const TIMESTAMP = /\b(\d{1,2}):([0-5]\d)\b/g;

function inline(text: string, keyPrefix: string, onSeek: Props["onSeek"], locale: Locale): React.ReactNode[] {
  // Split on `code`, **bold** and \( inline math \).
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\\\([^)]*\\\))/g).filter(Boolean);
  return parts.flatMap((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      const tex = part.slice(2, -2).trim();
      return (
        <span key={key} role="math" aria-label={tex} className="rounded bg-muted px-1 font-mono text-[0.8125rem]">
          {tex}
        </span>
      );
    }
    if (!onSeek) return [part];
    // Video timestamps become seek buttons.
    const nodes: React.ReactNode[] = [];
    let last = 0;
    for (const match of part.matchAll(TIMESTAMP)) {
      const seconds = Number(match[1]) * 60 + Number(match[2]);
      nodes.push(part.slice(last, match.index));
      nodes.push(<TimestampLink key={`${key}-t${match.index}`} seconds={seconds} onSeek={onSeek} locale={locale} />);
      last = (match.index ?? 0) + match[0].length;
    }
    nodes.push(part.slice(last));
    return nodes;
  });
}

function isTableRow(line: string) {
  return /^\s*\|.*\|\s*$/.test(line);
}

export function TutorMarkdown({ text, locale, onSeek }: Props) {
  const blocks: React.ReactNode[] = [];
  // Fenced code first, so its contents are never parsed as Markdown.
  const segments = text.split(/```(\w*)\n?([\s\S]*?)```/g);

  for (let s = 0; s < segments.length; s += 3) {
    const prose = segments[s] ?? "";
    // Block math: $$ … $$ or \[ … \]
    const mathSplit = prose.split(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g);
    for (let m = 0; m < mathSplit.length; m += 3) {
      const chunk = mathSplit[m] ?? "";
      const lines = chunk.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const key = `b${s}-${m}-${i}`;
        if (!line.trim()) {
          i++;
          continue;
        }
        const heading = /^#{1,4}\s+(.*)$/.exec(line);
        if (heading) {
          blocks.push(<p key={key} className="font-semibold text-foreground">{inline(heading[1], key, onSeek, locale)}</p>);
          i++;
          continue;
        }
        if (isTableRow(line)) {
          const rows: string[][] = [];
          while (i < lines.length && isTableRow(lines[i])) {
            const cells = lines[i].trim().slice(1, -1).split("|").map((cell) => cell.trim());
            if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
            i++;
          }
          const [head, ...body] = rows;
          blocks.push(
            <div key={key} className="overflow-x-auto rounded-lg border border-border" tabIndex={0}>
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>{head?.map((cell, c) => <th key={c} scope="col" className="px-3 py-1.5 text-left text-xs font-medium">{inline(cell, `${key}h${c}`, onSeek, locale)}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((row, r) => (
                    <tr key={r} className="border-t border-border">
                      {row.map((cell, c) => <td key={c} className="px-3 py-1.5">{inline(cell, `${key}r${r}c${c}`, onSeek, locale)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        if (ordered || /^\s*[-*•]\s+/.test(line)) {
          const items: string[] = [];
          const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/;
          while (i < lines.length && pattern.test(lines[i])) {
            items.push(lines[i].replace(pattern, ""));
            i++;
          }
          const List = ordered ? "ol" : "ul";
          blocks.push(
            <List key={key} className={`flex flex-col gap-1 pl-5 text-sm ${ordered ? "list-decimal" : "list-disc"} marker:text-muted-foreground`}>
              {items.map((item, n) => <li key={n}>{inline(item, `${key}-${n}`, onSeek, locale)}</li>)}
            </List>
          );
          continue;
        }
        const paragraph: string[] = [];
        while (i < lines.length && lines[i].trim() && !isTableRow(lines[i]) && !/^\s*(\d+[.)]|[-*•])\s+/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i])) {
          paragraph.push(lines[i]);
          i++;
        }
        blocks.push(<p key={key} className="text-sm text-foreground">{inline(paragraph.join(" "), key, onSeek, locale)}</p>);
      }
      const tex = (mathSplit[m + 1] ?? mathSplit[m + 2])?.trim();
      if (tex) {
        blocks.push(<FormulaBlock key={`f${s}-${m}`} tex={tex} spoken={`Formula: ${tex}`} locale={locale} />);
      }
    }
    const code = segments[s + 2];
    if (code !== undefined) {
      blocks.push(<CodeBlock key={`c${s}`} language={segments[s + 1] || ""} code={code.replace(/\n$/, "")} locale={locale} />);
    }
  }

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
