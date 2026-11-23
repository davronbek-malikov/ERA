"use client";

import * as React from "react";
import { ArrowUp, ImagePlus, Mic, Square, Video } from "lucide-react";

import { ContextChip } from "@/components/assistant/context-chip";
import type {
  AssistantAttachment,
  AssistantContextChip,
  AssistantLocaleProps,
  AttachmentKind
} from "@/components/assistant/types";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    placeholder: "Ask a question",
    send: "Send",
    stop: "Stop generating",
    remove: "Remove",
    attach: { image: "Attach an image", video: "Attach a video", audio: "Attach audio" },
    voice: "Ask with your voice",
    remaining: (count: number) => `${count} characters left`
  },
  uz: {
    placeholder: "Savol bering",
    send: "Yuborish",
    stop: "To'xtatish",
    remove: "Olib tashlash",
    attach: { image: "Rasm biriktirish", video: "Video biriktirish", audio: "Audio biriktirish" },
    voice: "Ovoz bilan so'rash",
    remaining: (count: number) => `${count} ta belgi qoldi`
  }
};

const attachmentIcons: Record<AttachmentKind, React.ReactNode> = {
  image: <ImagePlus />,
  video: <Video />,
  audio: <Mic />
};

type AssistantComposerProps = AssistantLocaleProps & {
  onSubmit: (message: string) => void;
  /** Context the user attached (timestamp, selection). Removable before sending. */
  chips?: AssistantContextChip[];
  onRemoveChip?: (id: string) => void;
  generating?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  /**
   * Future multimodal input. Empty by default, so no controls render. Enabling a kind
   * only shows its button and calls onAttachRequest: there is no upload in this phase.
   */
  enabledAttachments?: AttachmentKind[];
  onAttachRequest?: (kind: AttachmentKind) => void;
  attachments?: AssistantAttachment[];
  /** Future voice input. The microphone button renders only when this is provided. */
  onVoiceRequest?: () => void;
  /** One-line privacy statement under the input (for example "Only you can see this conversation"). */
  footnote?: React.ReactNode;
};

export const AssistantComposer = React.forwardRef<HTMLTextAreaElement, AssistantComposerProps>(
  function AssistantComposer(
    {
      locale = "en",
      onSubmit,
      chips = [],
      onRemoveChip,
      generating = false,
      onStop,
      disabled = false,
      placeholder,
      maxLength = 3000,
      enabledAttachments = [],
      onAttachRequest,
      attachments = [],
      onVoiceRequest,
      footnote
    },
    ref
  ) {
    const t = copy[locale];
    const [value, setValue] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const remaining = maxLength - value.length;
    const canSend = value.trim().length > 0 && !disabled && !generating;

    React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

    // Grow with the content up to about six lines.
    React.useLayoutEffect(() => {
      const element = textareaRef.current;
      if (!element) {
        return;
      }
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    }, [value]);

    function submit() {
      if (!canSend) {
        return;
      }
      onSubmit(value.trim());
      setValue("");
    }

    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border border-input bg-surface p-2 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15",
            disabled && "bg-muted"
          )}
        >
          {chips.length > 0 || attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <ContextChip key={chip.id} chip={chip} onRemove={onRemoveChip} removeLabel={t.remove} />
              ))}
              {attachments.map((attachment) => (
                <ContextChip
                  key={attachment.id}
                  chip={{ id: attachment.id, kind: "material", label: attachment.name }}
                />
              ))}
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, maxLength))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={disabled}
            placeholder={placeholder ?? t.placeholder}
            aria-label={placeholder ?? t.placeholder}
            className="max-h-40 min-h-[2.25rem] w-full resize-none bg-transparent px-1.5 py-1 text-base text-foreground md:text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-1">
            {enabledAttachments.map((kind) => (
              <Tooltip key={kind} content={t.attach[kind]}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.attach[kind]}
                  onClick={() => onAttachRequest?.(kind)}
                  disabled={disabled}
                >
                  {attachmentIcons[kind]}
                </Button>
              </Tooltip>
            ))}
            {onVoiceRequest ? (
              <Tooltip content={t.voice}>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t.voice} onClick={onVoiceRequest} disabled={disabled}>
                  <Mic />
                </Button>
              </Tooltip>
            ) : null}
            <span className={cn("ml-auto pr-1 text-xs tabular-nums text-muted-foreground", remaining > 200 && "sr-only")}>
              {t.remaining(remaining)}
            </span>
            {generating ? (
              <Button type="button" variant="outline" size="icon-sm" aria-label={t.stop} onClick={onStop}>
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" aria-label={t.send} disabled={!canSend}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
        {footnote ? <p className="px-1 text-center text-xs text-muted-foreground">{footnote}</p> : null}
      </form>
    );
  }
);
