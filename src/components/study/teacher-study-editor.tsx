"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, FileText, Loader2, Plus, RotateCcw, Save, Sparkles, Trash2, Upload, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { QuestionLevel, StudyGuideContent, StudyLanguage, StudyQuestion } from "@/server/study/content";

/*
 * Teacher side of the study room (docs/ERA_STUDY_ROOM.md): 1. upload the lesson's files, 2. let AI write the guide,
 * 3. review and edit it (Uzbek and English), 4. publish it for every student of the course, 5. see results.
 * The page is in Uzbek (the teacher's language); the guide itself is edited in both languages.
 */

type Material = { id: string; filename: string; fileType: string; pageCount: number | null; charCount: number; createdAt: string };
type Guide = { status: "DRAFT" | "PUBLISHED"; generatedWith: string | null; generatedAt: string | null; publishedAt: string | null; uz: StudyGuideContent; en: StudyGuideContent; counts: Record<QuestionLevel, number>; hasEnglish: boolean };
type Result = { userId: string; name: string; answered: number; correct: number; choiceAnswered: number; openAverage: number | null; last: string };

const STEPS = [
  { step: "chapter", label: "Dars matni va xulosa (o'zbekcha)" },
  { step: "questions", label: "Savollar: tekshiruv nuqtalari, 5 oson, 5 o'rta, 5 qiyin" },
  { step: "english", label: "Inglizcha tarjima" }
] as const;
type StepState = "idle" | "running" | "done" | "failed";

const LEVEL_LABEL: Record<QuestionLevel, string> = { EASY: "Oson", MEDIUM: "O'rta", ADVANCED: "Qiyin (intervyu)", CHECKPOINT: "Tekshiruv nuqtasi" };
const MIME: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown" };

async function call<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as ({ ok?: boolean; message?: string; error?: string } & T) | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? payload?.error ?? "Xatolik yuz berdi.");
  return payload;
}

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function lines(value: string[]) {
  return value.join("\n");
}

function QuestionEditor({ question, onChange, onDelete }: { question: StudyQuestion; onChange: (next: StudyQuestion) => void; onDelete: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={question.level === "EASY" ? "success" : question.level === "MEDIUM" ? "warning" : "primary"}>{LEVEL_LABEL[question.level]}</Badge>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-error hover:bg-error/10 hover:text-error" aria-label="Savolni o'chirish">
          <Trash2 />
        </Button>
      </div>
      <textarea className={inputClass} rows={2} value={question.prompt} onChange={(event) => onChange({ ...question, prompt: event.target.value })} aria-label="Savol" />
      {question.kind === "choice" ? (
        <div className="flex flex-col gap-1.5">
          {question.options.map((option, index) => (
            <label key={index} className="flex items-center gap-2 text-sm">
              <input type="radio" className="accent-primary" checked={question.correct === index} onChange={() => onChange({ ...question, correct: index })} aria-label={`To'g'ri javob: ${index + 1}`} />
              <input
                className={inputClass}
                value={option}
                onChange={(event) => onChange({ ...question, options: question.options.map((item, position) => (position === index ? event.target.value : item)) })}
                aria-label={`Variant ${index + 1}`}
              />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Doiracha — to&apos;g&apos;ri javob.</p>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Namunaviy javob (o&apos;quvchi javobini AI shu bilan solishtiradi)
          <textarea className={inputClass} rows={3} value={question.modelAnswer} onChange={(event) => onChange({ ...question, modelAnswer: event.target.value })} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Izoh (javobdan keyin ko&apos;rsatiladi)
        <textarea className={inputClass} rows={2} value={question.explanation} onChange={(event) => onChange({ ...question, explanation: event.target.value })} />
      </label>
    </div>
  );
}

function GuideEditor({ value, onChange }: { value: StudyGuideContent; onChange: (next: StudyGuideContent) => void }) {
  const setSection = (index: number, next: Partial<StudyGuideContent["sections"][number]>) => onChange({ ...value, sections: value.sections.map((section, position) => (position === index ? { ...section, ...next } : section)) });
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Xulosa</h3>
        <label className="flex flex-col gap-1 text-sm">
          Sarlavha
          <input className={inputClass} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Dars haqida qisqacha
          <textarea className={inputClass} rows={4} value={value.briefing} onChange={(event) => onChange({ ...value, briefing: event.target.value })} />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Nimalarni o&apos;rganasiz (har qatorga bittadan)
            <textarea className={inputClass} rows={5} value={lines(value.outcomes)} onChange={(event) => onChange({ ...value, outcomes: event.target.value.split("\n") })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Asosiy fikrlar (har qatorga bittadan)
            <textarea className={inputClass} rows={5} value={lines(value.keyPoints)} onChange={(event) => onChange({ ...value, keyPoints: event.target.value.split("\n") })} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Muhim atamalar (har qatorda: atama — ta&apos;rif)
          <textarea
            className={inputClass}
            rows={5}
            value={value.keyTerms.map((term) => `${term.term} — ${term.definition}`).join("\n")}
            onChange={(event) =>
              onChange({
                ...value,
                keyTerms: event.target.value.split("\n").map((line) => {
                  const [term, ...rest] = line.split(" — ");
                  return { term: term ?? "", definition: rest.join(" — ") };
                })
              })
            }
          />
        </label>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-base font-semibold">Dars matni (bo&apos;limlar)</h3>
        {value.sections.map((section, index) => (
          <details key={section.id} className="group rounded-xl border border-border" open={index === 0}>
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
              {index + 1}. {section.title || "—"} <span className="font-normal text-muted-foreground">· {section.checkpoint.length} ta tekshiruv savoli</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-4">
              <input className={inputClass} value={section.title} onChange={(event) => setSection(index, { title: event.target.value })} aria-label="Bo'lim sarlavhasi" />
              <textarea className={cn(inputClass, "font-mono text-[0.8rem]")} rows={14} value={section.body} onChange={(event) => setSection(index, { body: event.target.value })} aria-label="Bo'lim matni (Markdown)" />
              {section.checkpoint.map((question, position) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  onChange={(next) => setSection(index, { checkpoint: section.checkpoint.map((item, at) => (at === position ? next : item)) })}
                  onDelete={() => setSection(index, { checkpoint: section.checkpoint.filter((_, at) => at !== position) })}
                />
              ))}
              <Button size="sm" variant="ghost" className="w-fit text-error hover:bg-error/10 hover:text-error" onClick={() => onChange({ ...value, sections: value.sections.filter((_, at) => at !== index) })}>
                <Trash2 />
                Bo&apos;limni o&apos;chirish
              </Button>
            </div>
          </details>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">&quot;O&apos;zingizni sinang&quot; savollari ({value.questions.length})</h3>
        {(["EASY", "MEDIUM", "ADVANCED"] as const).map((level) => (
          <div key={level} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{LEVEL_LABEL[level]}</p>
            {value.questions.map((question, index) =>
              question.level === level ? (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  onChange={(next) => onChange({ ...value, questions: value.questions.map((item, at) => (at === index ? next : item)) })}
                  onDelete={() => onChange({ ...value, questions: value.questions.filter((_, at) => at !== index) })}
                />
              ) : null
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export function TeacherStudyEditor({
  lessonId,
  lessonTitle,
  courseTitle,
  previewHref,
  hasNotes,
  materials,
  guide,
  results
}: {
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  previewHref: string | null;
  hasNotes: boolean;
  materials: Material[];
  guide: Guide | null;
  results: Result[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState(false);
  const [steps, setSteps] = React.useState<Record<string, StepState>>({});
  const [stepError, setStepError] = React.useState("");
  const [language, setLanguage] = React.useState<StudyLanguage>("uz");
  const [draft, setDraft] = React.useState<{ uz: StudyGuideContent; en: StudyGuideContent } | null>(guide ? { uz: guide.uz, en: guide.en } : null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const generating = Object.values(steps).includes("running");

  React.useEffect(() => {
    if (!dirty) setDraft(guide ? { uz: guide.uz, en: guide.en } : null);
  }, [guide, dirty]);

  async function upload(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = MIME[ext] ?? file.type;
    if (!MIME[ext]) {
      toast({ title: "Faqat PDF, DOCX, TXT yoki MD fayl yuklang.", variant: "error" });
      return;
    }
    setUploading(true);
    try {
      const signed = await call<{ uploadUrl: string; path: string }>("/api/admin/storage/upload", "POST", { filename: file.name.replace(/[^\w.\-()\s]/g, "_"), contentType: mimeType, folder: "knowledge-documents", fileSize: file.size });
      const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
      if (!put.ok) throw new Error("Fayl yuklanmadi. Qayta urinib ko'ring.");
      await call(`/api/teacher/study/${lessonId}/materials`, "POST", { storagePath: signed.path, filename: file.name, mimeType, fileSize: file.size });
      toast({ title: `${file.name} qo'shildi`, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: (error as Error).message, variant: "error" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeMaterial(id: string) {
    try {
      await call(`/api/teacher/study/${lessonId}/materials/${id}`, "DELETE");
      router.refresh();
    } catch (error) {
      toast({ title: (error as Error).message, variant: "error" });
    }
  }

  async function generate(from: (typeof STEPS)[number]["step"] = "chapter") {
    if (dirty && !window.confirm("Saqlanmagan o'zgarishlar yo'qoladi. Davom etasizmi?")) return;
    if (from === "chapter" && guide && !window.confirm("Darslik qaytadan yoziladi va qoralamaga o'tadi (o'quvchilar uni qayta nashr qilguningizcha ko'rmaydi). Davom etasizmi?")) return;
    setStepError("");
    const start = STEPS.findIndex((item) => item.step === from);
    const next: Record<string, StepState> = {};
    STEPS.forEach((item, index) => (next[item.step] = index < start ? "done" : "idle"));
    setSteps(next);
    for (const item of STEPS.slice(start)) {
      setSteps((current) => ({ ...current, [item.step]: "running" }));
      try {
        await call(`/api/teacher/study/${lessonId}/generate`, "POST", { step: item.step });
        setSteps((current) => ({ ...current, [item.step]: "done" }));
      } catch (error) {
        setSteps((current) => ({ ...current, [item.step]: "failed" }));
        setStepError((error as Error).message);
        router.refresh();
        return;
      }
    }
    setDirty(false);
    toast({ title: "Darslik tayyor. Ko'rib chiqing va nashr qiling.", variant: "success" });
    router.refresh();
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await call(`/api/teacher/study/${lessonId}/guide`, "PUT", { language: "uz", content: draft.uz });
      if (draft.en.sections.length) await call(`/api/teacher/study/${lessonId}/guide`, "PUT", { language: "en", content: draft.en });
      setDirty(false);
      toast({ title: "Saqlandi. O'quvchilar ko'rishi uchun qayta nashr qiling.", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: (error as Error).message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function publish(next: boolean) {
    if (dirty) {
      toast({ title: "Avval o'zgarishlarni saqlang.", variant: "error" });
      return;
    }
    setPublishing(true);
    try {
      await call(`/api/teacher/study/${lessonId}/publish`, "POST", { publish: next });
      toast({ title: next ? "Nashr qilindi: kursning barcha o'quvchilari ko'ra oladi." : "Qoralamaga qaytarildi.", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: (error as Error).message, variant: "error" });
    } finally {
      setPublishing(false);
    }
  }

  const failedStep = STEPS.find((item) => steps[item.step] === "failed")?.step;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{courseTitle}</p>
          <p className="font-semibold">{lessonTitle}</p>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {guide ? <Badge variant={guide.status === "PUBLISHED" ? "success" : "warning"}>{guide.status === "PUBLISHED" ? "Nashr qilingan" : "Qoralama"}</Badge> : <Badge variant="neutral">Hali yaratilmagan</Badge>}
            {guide?.generatedWith ? <span>AI: {guide.generatedWith}</span> : null}
            {guide ? (
              <span>
                Savollar: {guide.counts.EASY} oson · {guide.counts.MEDIUM} o&apos;rta · {guide.counts.ADVANCED} qiyin · {guide.counts.CHECKPOINT} tekshiruv
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {previewHref && guide ? (
            <Link href={previewHref} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">
              <Eye className="size-4" aria-hidden="true" />
              O&apos;quvchi ko&apos;rinishi
            </Link>
          ) : null}
          {guide?.status === "PUBLISHED" ? (
            <Button variant="outline" onClick={() => publish(false)} disabled={publishing}>
              Qoralamaga qaytarish
            </Button>
          ) : guide ? (
            <Button onClick={() => publish(true)} disabled={publishing || generating || !guide.uz.questions.length}>
              {publishing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Nashr qilish
            </Button>
          ) : null}
        </div>
      </div>

      {/* 1. Materials */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby="materials-title">
        <h2 id="materials-title" className="font-semibold">
          1. Dars materiallari
        </h2>
        <p className="text-sm text-muted-foreground">
          Shu dars bo&apos;yicha slaydlar, konspekt yoki maqolalarni yuklang (PDF, DOCX, TXT, MD). AI darslikni faqat shular asosida yozadi.
          {hasNotes ? " \"Nima o'tdim\" va uy vazifasi matni ham qo'shiladi." : ""}
        </p>
        {materials.length ? (
          <ul className="flex flex-col gap-1.5">
            {materials.map((material) => (
              <li key={material.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{material.filename}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {material.pageCount ? `${material.pageCount} bet · ` : ""}
                    {Math.round(material.charCount / 1000)}k belgi
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeMaterial(material.id)} aria-label={`${material.filename} o'chirish`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" id="study-file" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
          <label htmlFor="study-file" className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted", uploading && "pointer-events-none opacity-60")}>
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {uploading ? "Yuklanmoqda…" : "Fayl yuklash"}
          </label>
        </div>
      </section>

      {/* 2. Generate */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby="generate-title">
        <h2 id="generate-title" className="font-semibold">
          2. AI bilan darslik yaratish
        </h2>
        <p className="text-sm text-muted-foreground">Bir necha daqiqa davom etadi. Sahifani yopmang.</p>
        {Object.keys(steps).length ? (
          <ol className="flex flex-col gap-1.5 text-sm" aria-live="polite">
            {STEPS.map((item) => (
              <li key={item.step} className="flex items-center gap-2">
                {steps[item.step] === "running" ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                ) : steps[item.step] === "done" ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                ) : steps[item.step] === "failed" ? (
                  <XCircle className="size-4 text-error" aria-hidden="true" />
                ) : (
                  <span className="size-4 rounded-full border border-border" aria-hidden="true" />
                )}
                {item.label}
              </li>
            ))}
          </ol>
        ) : null}
        {stepError ? <p className="text-sm text-error">{stepError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => generate("chapter")} disabled={generating || (!materials.length && !hasNotes)}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {guide ? "Qaytadan yaratish" : "AI bilan yaratish"}
          </Button>
          {failedStep ? (
            <Button variant="outline" onClick={() => generate(failedStep)} disabled={generating}>
              <RotateCcw />
              Shu qadamdan davom ettirish
            </Button>
          ) : guide && !guide.hasEnglish && guide.uz.questions.length && !generating ? (
            <Button variant="outline" onClick={() => generate("english")}>
              <Plus />
              Inglizcha tarjimani yaratish
            </Button>
          ) : null}
        </div>
        {!materials.length && !hasNotes ? <p className="text-xs text-muted-foreground">Avval kamida bitta fayl yuklang.</p> : null}
      </section>

      {/* 3. Review */}
      {draft && draft.uz.sections.length ? (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" aria-labelledby="review-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="review-title" className="font-semibold">
              3. Ko&apos;rib chiqish va tahrirlash
            </h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Til">
                {(["uz", "en"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setLanguage(value)} aria-pressed={language === value} className={cn("rounded-full px-3 py-1", language === value ? "bg-primary text-primary-foreground" : "hover:bg-muted")} disabled={value === "en" && !draft.en.sections.length}>
                    {value === "uz" ? "O'zbekcha" : "English"}
                  </button>
                ))}
              </div>
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Saqlash
              </Button>
            </div>
          </div>
          {dirty ? <p className="text-xs text-warning-foreground">Saqlanmagan o&apos;zgarishlar bor.</p> : null}
          {language === "en" && draft.uz.questions.length !== draft.en.questions.length ? (
            <p className="text-xs text-muted-foreground">Eslatma: savollarni o&apos;zbekchada o&apos;chirsangiz yoki qo&apos;shsangiz, inglizcha tarjimani qayta yarating.</p>
          ) : null}
          <GuideEditor
            value={language === "uz" ? draft.uz : draft.en}
            onChange={(next) => {
              setDraft((current) => (current ? { ...current, [language]: next } : current));
              setDirty(true);
            }}
          />
        </section>
      ) : null}

      {/* 4. Results */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby="results-title">
        <h2 id="results-title" className="font-semibold">
          4. O&apos;quvchilar natijalari
        </h2>
        {results.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">O&apos;quvchi</th>
                  <th className="py-2 pr-3 font-medium">Javob bergan</th>
                  <th className="py-2 pr-3 font-medium">Test (to&apos;g&apos;ri)</th>
                  <th className="py-2 pr-3 font-medium">Intervyu (o&apos;rtacha ball)</th>
                  <th className="py-2 font-medium">Oxirgi faollik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((result) => (
                  <tr key={result.userId}>
                    <td className="py-2 pr-3 font-medium">{result.name}</td>
                    <td className="py-2 pr-3 tabular-nums">{result.answered}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {result.correct}/{result.choiceAnswered}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{result.openAverage ?? "—"}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">{result.last.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Hali hech kim savollarga javob bermagan.</p>
        )}
      </section>
    </div>
  );
}
