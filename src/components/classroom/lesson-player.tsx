"use client";

import * as React from "react";
import { Bookmark, Expand, Hand, Languages, Lightbulb, MessageCircleQuestion, Mic, RotateCcw, Sparkles } from "lucide-react";

import { usePlayerHandle } from "@/components/classroom/player-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { formatClock } from "@/lib/era/tutor-client";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type HandRaiseAction = "ask" | "explain" | "example" | "translate";

const copy = {
  en: {
    speed: "Speed",
    fullscreen: "Fullscreen",
    raiseHand: "Raise hand",
    raiseHandHint: "Ask ERA without stopping the video",
    ask: "Ask a question",
    explain: "Explain this moment",
    example: "Give an example",
    translate: "Explain in Uzbek",
    voice: "Ask by voice",
    soon: "Coming soon",
    bookmark: "Bookmark this moment",
    resumed: (time: string) => `Resumed at ${time}`,
    startOver: "Start over",
    noVideo: "This lesson has no video. Use the notes and materials below.",
    noTimeline: "Timestamps aren't available for this video, so ERA can't see the exact moment.",
    error: "The video couldn't load. Check your connection and try again.",
    retry: "Try again"
  },
  uz: {
    speed: "Tezlik",
    fullscreen: "To'liq ekran",
    raiseHand: "Qo'l ko'tarish",
    raiseHandHint: "Videoni to'xtatmasdan ERAdan so'rang",
    ask: "Savol berish",
    explain: "Shu lahzani tushuntirish",
    example: "Misol keltirish",
    translate: "O'zbek tilida tushuntirish",
    voice: "Ovoz bilan so'rash",
    soon: "Tez orada",
    bookmark: "Shu lahzani belgilash",
    resumed: (time: string) => `${time} dan davom ettirildi`,
    startOver: "Boshidan boshlash",
    noVideo: "Bu darsda video yo'q. Quyidagi izohlar va materiallardan foydalaning.",
    noTimeline: "Bu video uchun vaqt belgilari mavjud emas, shuning uchun ERA aniq lahzani ko'ra olmaydi.",
    error: "Video yuklanmadi. Internet aloqasini tekshirib, qayta urinib ko'ring.",
    retry: "Qayta urinish"
  }
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

type Source =
  | { kind: "file"; url: string }
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string }
  | { kind: "none" };

function detectSource(url: string | null): Source {
  if (!url) return { kind: "none" };
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v") ?? parsed.pathname.split("/embed/")[1]?.split("/")[0];
      if (id) return { kind: "youtube", id };
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      if (id) return { kind: "youtube", id };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id) return { kind: "vimeo", id };
    }
  } catch {
    return { kind: "file", url };
  }
  return { kind: "file", url };
}

/* Minimal typing for the YouTube IFrame API. */
type YouTubePlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};
type YouTubeNamespace = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer };
declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApi: Promise<YouTubeNamespace> | null = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  youTubeApi ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YouTubeNamespace);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return youTubeApi;
}

type LessonPlayerProps = {
  lessonId: string;
  title: string;
  videoUrl: string | null;
  locale: Locale;
  /** Student mode: remember the position on this device and report the watched threshold. */
  persist: boolean;
  /** Called once when 90% of the video has been watched. */
  onWatched?: () => void;
  /** Hand-raise actions. Omitted when the tutor is unavailable (Teacher Preview). */
  onHandRaise?: (action: HandRaiseAction, seconds: number | null) => void;
  onBookmark?: (seconds: number) => void;
};

const storageKey = (lessonId: string) => `era:video-position:${lessonId}`;

function readSaved(lessonId: string) {
  try {
    return Number(window.localStorage.getItem(storageKey(lessonId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeSaved(lessonId: string, seconds: number) {
  try {
    window.localStorage.setItem(storageKey(lessonId), String(Math.floor(seconds)));
  } catch {
    // Storage can be unavailable (private mode); resuming is a convenience only.
  }
}

export function LessonPlayer({ lessonId, title, videoUrl, locale, persist, onWatched, onHandRaise, onBookmark }: LessonPlayerProps) {
  const t = copy[locale];
  const handle = usePlayerHandle();
  const source = React.useMemo(() => detectSource(videoUrl), [videoUrl]);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const youTubeTarget = React.useRef<HTMLDivElement>(null);
  const youTube = React.useRef<YouTubePlayer | null>(null);
  const metadataHandled = React.useRef(false);
  const watchedReported = React.useRef(false);
  const [speed, setSpeed] = React.useState(1);
  const [resumedAt, setResumedAt] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState(false);
  const hasTimeline = source.kind === "file" || source.kind === "youtube";

  // Expose time and seek to the tutor through the shared handle.
  React.useEffect(() => {
    handle.current = {
      hasTimeline,
      getTime: () => {
        if (source.kind === "file") return videoRef.current?.currentTime ?? null;
        if (source.kind === "youtube") return youTube.current?.getCurrentTime() ?? null;
        return null;
      },
      seek: (seconds) => {
        if (source.kind === "file" && videoRef.current) {
          videoRef.current.currentTime = seconds;
          videoRef.current.focus();
        }
        if (source.kind === "youtube") youTube.current?.seekTo(seconds, true);
      }
    };
    return () => {
      handle.current = null;
    };
  }, [handle, hasTimeline, source.kind]);

  const track = React.useCallback(
    (seconds: number, duration: number) => {
      if (!persist || !Number.isFinite(duration) || duration <= 0) return;
      writeSaved(lessonId, seconds);
      if (!watchedReported.current && seconds / duration >= 0.9) {
        watchedReported.current = true;
        onWatched?.();
      }
    },
    [lessonId, onWatched, persist]
  );

  const restore = React.useCallback(
    (duration: number, seek: (seconds: number) => void) => {
      if (!persist) return;
      const saved = readSaved(lessonId);
      if (saved > 5 && saved < duration - 5) {
        seek(saved);
        setResumedAt(saved);
      }
    },
    [lessonId, persist]
  );

  // YouTube embed with the IFrame API.
  React.useEffect(() => {
    if (source.kind !== "youtube" || !youTubeTarget.current) return;
    let cancelled = false;
    let poll: number | undefined;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !youTubeTarget.current) return;
      youTube.current = new YT.Player(youTubeTarget.current, {
        videoId: source.id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            const player = youTube.current;
            if (!player) return;
            restore(player.getDuration(), (seconds) => player.seekTo(seconds, true));
            poll = window.setInterval(() => track(player.getCurrentTime(), player.getDuration()), 5000);
          }
        }
      });
    });
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      youTube.current?.destroy();
      youTube.current = null;
    };
  }, [restore, source, track]);

  // Apply speed and restore the saved position once metadata is known.
  const onMetadata = React.useCallback(
    (video: HTMLVideoElement) => {
      if (metadataHandled.current) return;
      metadataHandled.current = true;
      video.playbackRate = speed;
      restore(video.duration, (seconds) => {
        video.currentTime = seconds;
      });
    },
    [restore, speed]
  );

  // The server-rendered <video> can load metadata before React attaches onLoadedMetadata,
  // so check on mount as well.
  React.useEffect(() => {
    const video = videoRef.current;
    if (source.kind === "file" && video && video.readyState >= 1) onMetadata(video);
  }, [onMetadata, source.kind]);

  // Save the native video's position when the student leaves the page.
  React.useEffect(() => {
    if (source.kind !== "file" || !persist) return;
    const save = () => {
      const video = videoRef.current;
      if (video) writeSaved(lessonId, video.currentTime);
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [lessonId, persist, source.kind]);

  function changeSpeed(value: number) {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
    youTube.current?.setPlaybackRate(value);
  }

  function now() {
    return handle.current?.getTime() ?? null;
  }

  if (source.kind === "none") {
    return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{t.noVideo}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={frameRef} className="overflow-hidden rounded-xl bg-foreground">
        {source.kind === "file" ? (
          failed ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-sm text-background">
              <p>{t.error}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFailed(false);
                  videoRef.current?.load();
                }}
              >
                {t.retry}
              </Button>
            </div>
          ) : null
        ) : null}
        {source.kind === "file" ? (
          <video
            ref={videoRef}
            src={source.url}
            controls
            playsInline
            preload="metadata"
            aria-label={title}
            className={cn("aspect-video w-full bg-foreground", failed && "hidden")}
            onLoadedMetadata={(event) => onMetadata(event.currentTarget)}
            onTimeUpdate={(event) => track(event.currentTarget.currentTime, event.currentTarget.duration)}
            onPause={(event) => track(event.currentTarget.currentTime, event.currentTarget.duration)}
            onEnded={(event) => track(event.currentTarget.duration, event.currentTarget.duration)}
            onError={() => setFailed(true)}
          />
        ) : source.kind === "youtube" ? (
          <div className="aspect-video w-full [&>iframe]:size-full">
            <div ref={youTubeTarget} title={title} />
          </div>
        ) : (
          <iframe
            src={`https://player.vimeo.com/video/${source.id}`}
            title={title}
            className="aspect-video w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onHandRaise ? (
          <DropdownMenu>
            <Tooltip content={t.raiseHandHint}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="primary">
                  <Hand />
                  {t.raiseHand}
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t.raiseHandHint}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onHandRaise("ask", null)}>
                <MessageCircleQuestion /> {t.ask}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onHandRaise("explain", now())}>
                <Sparkles /> {t.explain}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onHandRaise("example", now())}>
                <Lightbulb /> {t.example}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onHandRaise("translate", now())}>
                <Languages /> {t.translate}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Mic /> {t.voice} <span className="ml-auto text-xs">{t.soon}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {hasTimeline ? (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {t.speed}
            <select
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value))}
              className="h-8 rounded-lg border border-input bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">{t.noTimeline}</p>
        )}
        {hasTimeline && onBookmark ? (
          <Tooltip content={t.bookmark}>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t.bookmark}
              onClick={() => {
                const seconds = now();
                if (seconds !== null) onBookmark(seconds);
              }}
            >
              <Bookmark />
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip content={t.fullscreen}>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t.fullscreen}
            className={hasTimeline ? undefined : "ml-auto"}
            onClick={() => frameRef.current?.requestFullscreen?.()}
          >
            <Expand />
          </Button>
        </Tooltip>
      </div>

      {resumedAt !== null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          {t.resumed(formatClock(resumedAt))}
          <button
            type="button"
            className="inline-flex min-h-6 items-center gap-1 font-medium text-primary hover:underline"
            onClick={() => {
              handle.current?.seek(0);
              setResumedAt(null);
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {t.startOver}
          </button>
        </p>
      ) : null}
    </div>
  );
}
