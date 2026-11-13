"use client";

/*
 * Voice for the ERA Assistant (browser side).
 *  - Recording: microphone → MediaRecorder. In talk mode a level meter stops the recording automatically after a
 *    short silence, so the conversation is hands-free.
 *  - Speech to text: the recording goes to /api/ai/transcribe (Whisper on the server). Nothing is stored.
 *  - Text to speech: the browser's own speech synthesis reads answers aloud (free, offline-capable).
 */

export type Recording = {
  /** Stops and returns the audio (null if nothing usable was recorded). */
  stop: () => Promise<Blob | null>;
  /** Discards the recording. */
  cancel: () => void;
};

type RecordOptions = {
  /** Called ~10× per second with the input level (0–1), for a visual meter. */
  onLevel?: (level: number) => void;
  /** Stop automatically after this much silence once the user has spoken (talk mode). */
  autoStopSilenceMs?: number;
  /** Called when the automatic stop fires. */
  onAutoStop?: () => void;
  maxDurationMs?: number;
};

export function voiceSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function pickMimeType() {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export async function startRecording(options: RecordOptions = {}): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start(250);

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioContext = AudioCtx ? new AudioCtx() : null;
  const analyser = audioContext?.createAnalyser();
  if (audioContext && analyser) {
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
  }
  const samples = new Uint8Array(analyser?.fftSize ?? 0);
  const started = Date.now();
  let spoke = false;
  let lastSound = Date.now();
  let finished = false;

  const timer = window.setInterval(() => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += ((value - 128) / 128) ** 2;
    const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
    options.onLevel?.(level);
    if (level > 0.08) {
      spoke = true;
      lastSound = Date.now();
    }
    const silentFor = Date.now() - lastSound;
    if (options.autoStopSilenceMs && spoke && silentFor > options.autoStopSilenceMs) options.onAutoStop?.();
    if (Date.now() - started > (options.maxDurationMs ?? 120_000)) options.onAutoStop?.();
  }, 100);

  const release = () => {
    window.clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    void audioContext?.close().catch(() => undefined);
  };

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        if (finished) return resolve(null);
        finished = true;
        recorder.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          resolve(blob.size > 1500 && Date.now() - started > 400 ? blob : null);
        };
        recorder.stop();
      }),
    cancel: () => {
      if (finished) return;
      finished = true;
      recorder.onstop = release;
      recorder.stop();
    }
  };
}

export class VoiceError extends Error {}

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, "voice");
  let response: Response;
  try {
    response = await fetch("/api/ai/transcribe", { method: "POST", body: form, signal });
  } catch {
    throw new VoiceError("You seem to be offline.");
  }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
  if (!response.ok || !payload?.ok) throw new VoiceError(payload?.error ?? "Couldn't understand the recording.");
  return payload.text ?? "";
}

/** Plain text for reading aloud: no Markdown symbols, code blocks or long links. */
function speakable(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " (code shown on screen) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[*_#>|~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessLanguage(text: string) {
  if (/[Ѐ-ӿ]/.test(text)) return "ru-RU";
  if (/[가-힯]/.test(text)) return "ko-KR";
  if (/\b(va|uchun|bilan|qanday|bu|emas|kerak)\b|o['ʻ’]|g['ʻ’]/i.test(text)) return "uz-UZ";
  return navigator.language || "en-US";
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Reads text aloud; resolves when finished (or stopped). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve();
    const content = speakable(text).slice(0, 2500);
    if (!content) return resolve();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = guessLanguage(content);
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()));
    if (voice) utterance.voice = voice;
    utterance.rate = 1.03;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
