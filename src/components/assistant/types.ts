import type { Locale } from "@/lib/i18n";

export type AssistantKind = "student-tutor" | "teacher-assistant" | "admin-assistant";

/**
 * What the assistant can see, shown as chips (docs/ERA_INFORMATION_ARCHITECTURE.md §9.10, §10).
 * Chips describe context the server has already authorized. They never grant access.
 */
export type ContextChipKind =
  | "course"
  | "lesson"
  | "notes"
  | "timestamp"
  | "selection"
  | "formula"
  | "material"
  | "submission"
  | "page";

export type AssistantContextChip = {
  id: string;
  kind: ContextChipKind;
  label: string;
  /** Chips the user attached (timestamp, selection) can be removed before sending. */
  removable?: boolean;
};

/**
 * Reserved for future multimodal input. ERA is text-first today: the composer shows no
 * attachment or voice controls unless a kind is explicitly enabled, and this phase
 * implements no upload or processing.
 */
export type AttachmentKind = "image" | "video" | "audio";

export type AssistantAttachment = { id: string; kind: AttachmentKind; name: string };

/**
 * One block of an assistant answer. To support a new output (for example audio), add a
 * member here and a case in AssistantParts; the exhaustive switch flags missing renderers.
 */
export type AssistantPart =
  | { kind: "text"; text: string }
  | { kind: "concept"; title: string; summary: string; details?: string[] }
  | { kind: "steps"; title?: string; steps: Array<{ title: string; body: string }> }
  | { kind: "hint"; hints: string[] }
  | { kind: "example"; title?: string; body: string }
  | { kind: "formula"; tex: string; spoken: string; caption?: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "citation"; lessonTitle: string; section?: string; href?: string }
  | { kind: "timestamp"; seconds: number; label?: string }
  | { kind: "feedback"; strengths: string[]; revisit: string[]; nextStep: string };

export type AssistantLocaleProps = { locale?: Locale };
