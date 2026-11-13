"use client";

import * as React from "react";
import { BookOpen, ClipboardCheck, Home, Inbox, MoreHorizontal, Settings, Trash2, Users } from "lucide-react";

import { AssistantComposer } from "@/components/assistant/assistant-composer";
import { AssistantMessage } from "@/components/assistant/assistant-message";
import { AssistantPanel, privacyNote } from "@/components/assistant/assistant-panel";
import { AssistantStatus } from "@/components/assistant/assistant-status";
import { AssistantParts, LearningGuardrailNotice } from "@/components/assistant/response-blocks";
import type { AssistantContextChip, AssistantPart } from "@/components/assistant/types";
import { CourseStatusBadge, CourseStatusConsequences } from "@/components/education/course-status";
import { LessonModeBanner } from "@/components/education/lesson-mode-banner";
import { CourseProgressCell, StudentIdentity, type TeacherVisibleStudent } from "@/components/education/student-identity";
import { AppShell, WorkspacePage, type NavGroup } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Alert, Kbd, Progress, Skeleton } from "@/components/ui/feedback";
import { Field, fieldDescribedBy } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DataTable } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";

const nav: NavGroup[] = [
  {
    items: [
      { href: "/design-system", label: "Home", icon: <Home /> },
      { href: "/design-system/courses", label: "My courses", icon: <BookOpen /> },
      { href: "/design-system/review", label: "Review", icon: <ClipboardCheck />, count: 4 },
      { href: "/design-system/students", label: "Students", icon: <Users /> }
    ]
  },
  { label: "Account", items: [{ href: "/design-system/settings", label: "Settings", icon: <Settings /> }] }
];

type RosterRow = { student: TeacherVisibleStudent; progress: number; done: number; total: number; lastActive: string };

const roster: RosterRow[] = [
  { student: { id: "1", name: "Aziza Karimova", email: "aziza@example.com" }, progress: 80, done: 8, total: 10, lastActive: "Today" },
  { student: { id: "2", name: "Jasur Toshmatov" }, progress: 30, done: 3, total: 10, lastActive: "6 days ago" },
  { student: { id: "3", name: "Malika Rahimova" }, progress: 100, done: 10, total: 10, lastActive: "Yesterday" }
];

const sampleAnswer: AssistantPart[] = [
  {
    kind: "concept",
    title: "What the sigmoid does",
    summary: "The sigmoid squashes any number into the range 0 to 1, so a neuron's output can be read as a probability.",
    details: ["Large positive inputs give values close to 1.", "Large negative inputs give values close to 0."]
  },
  { kind: "formula", tex: "\\sigma(x) = \\frac{1}{1 + e^{-x}}", spoken: "sigma of x equals one over one plus e to the minus x", caption: "Sigmoid function" },
  { kind: "timestamp", seconds: 272, label: "the lesson's sigmoid graph" },
  {
    kind: "steps",
    steps: [
      { title: "Compute the weighted sum", body: "Multiply each input by its weight and add the bias." },
      { title: "Apply the sigmoid", body: "Put the weighted sum into the formula above." },
      { title: "Read the output", body: "Values above 0.5 mean the neuron leans towards 'yes'." }
    ]
  },
  { kind: "hint", hints: ["Start with x = 0. What is e to the power 0?", "1 / (1 + 1) is a simple fraction."] },
  { kind: "example", body: "If the weighted sum is 2, the output is about 0.88." },
  { kind: "code", language: "python", code: "import math\n\ndef sigmoid(x):\n    return 1 / (1 + math.exp(-x))" },
  { kind: "citation", lessonTitle: "Lesson 3: Neurons and activation", section: "Key points" },
  {
    kind: "feedback",
    strengths: ["You computed the weighted sum correctly."],
    revisit: ["The sign of the exponent: it's e to the minus x."],
    nextStep: "Recalculate with the corrected exponent and compare with the example."
  }
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-8 first:border-t-0 first:pt-0">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

const swatches = [
  ["primary", "bg-primary"],
  ["accent-strong", "bg-accent-strong"],
  ["accent", "bg-accent"],
  ["foreground", "bg-foreground"],
  ["muted-foreground", "bg-muted-foreground"],
  ["border", "bg-border"],
  ["muted", "bg-muted"],
  ["background", "bg-background"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["error", "bg-error"]
] as const;

export function DesignSystemPreview({ locale = "en" }: { locale?: Locale }) {
  const [assistantOpen, setAssistantOpen] = React.useState(true);
  // Verification harness: simulates a streamed answer so Stop and the announcement can be tested.
  const [generating, setGenerating] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [lastQuestion, setLastQuestion] = React.useState<string | null>(null);
  const answerTimer = React.useRef<number | null>(null);

  function simulateAnswer(message: string) {
    setLastQuestion(message);
    setGenerating(true);
    answerTimer.current = window.setTimeout(() => {
      setGenerating(false);
      setAnnouncement(`ERA Tutor answered: ${message}`);
    }, 1500);
  }

  function stopAnswer() {
    if (answerTimer.current) {
      window.clearTimeout(answerTimer.current);
    }
    setGenerating(false);
    setAnnouncement("Answer stopped.");
  }
  const [chips, setChips] = React.useState<AssistantContextChip[]>([
    { id: "t", kind: "timestamp", label: "04:32", removable: true }
  ]);
  const [impact, setImpact] = React.useState<{ label: string; count: number }[] | null>(null);
  const [saving, setSaving] = React.useState(false);

  const assistant = (
    <AssistantPanel
      kind="student-tutor"
      locale={locale}
      announcement={announcement}
      open={assistantOpen}
      onOpenChange={setAssistantOpen}
      onNewConversation={() => toast({ title: "New conversation started" })}
      onOpenHistory={() => toast({ title: "History opens S9" })}
      mobileLauncherOffset="above-tab-bar"
      contextChips={[
        { id: "l", kind: "lesson", label: "Lesson 3: Neurons" },
        { id: "n", kind: "notes", label: "Notes" }
      ]}
      composer={
        <AssistantComposer
          chips={chips}
          onRemoveChip={(id) => setChips((current) => current.filter((chip) => chip.id !== id))}
          locale={locale}
          onSubmit={simulateAnswer}
          generating={generating}
          onStop={stopAnswer}
          footnote={privacyNote("student-tutor", locale)}
        />
      }
    >
      <LearningGuardrailNotice locale={locale} />
      <AssistantMessage role="user">What does the sigmoid do at 04:32?</AssistantMessage>
      <AssistantMessage role="assistant" assistantName="ERA Tutor">
        <AssistantParts parts={sampleAnswer} locale={locale} onSeek={(seconds) => toast({ title: `Seek to ${seconds}s` })} />
      </AssistantMessage>
      {lastQuestion ? <AssistantMessage role="user">{lastQuestion}</AssistantMessage> : null}
      {generating ? <AssistantStatus status={{ state: "thinking" }} locale={locale} /> : null}
      <AssistantStatus status={{ state: "rate-limited", retryAfterSeconds: 40 }} />
      <AssistantStatus status={{ state: "error", onRetry: () => toast({ title: "Retrying" }) }} />
    </AssistantPanel>
  );

  return (
    <AppShell
      workspaceLabel="Design system"
      homeHref="/design-system"
      nav={nav}
      mobileTabs={nav[0].items}
      assistant={assistant}
      topBarActions={<Badge variant="warning">Development only</Badge>}
    >
      <LessonModeBanner
        mode="teacher-preview"
        locale={locale}
        action={
          <Button size="sm" variant="outline">
            Exit preview
          </Button>
        }
      />
      <WorkspacePage>
        <PageHeader
          breadcrumbs={[{ label: "ERA", href: "/" }, { label: "Design system" }]}
          eyebrow="Reference"
          title="ERA design system"
          description="Every shared token and component, rendered with sample data. See docs/ERA_DESIGN_SYSTEM.md."
          actions={
            <>
              <Button variant="outline">Secondary</Button>
              <Button>Primary action</Button>
            </>
          }
        />

        <Section title="Colour">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {swatches.map(([name, className]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className={`h-12 rounded-lg border border-border ${className}`} />
                <span className="text-xs text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="flex flex-col gap-3">
            <p className="display-title">Display: public hero only</p>
            <p className="page-title">Page heading: 28px / 24px</p>
            <p className="section-title">Section heading: 20px / 18px</p>
            <p className="card-title">Card title: 16px</p>
            <p>Body: 14px. Oʻzbekcha matn: gʻoya, oʻquvchi. Кириллица: учебный курс.</p>
            <p className="text-caption text-muted-foreground">Caption: 12px</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading={saving} onClick={() => { setSaving(true); window.setTimeout(() => setSaving(false), 1500); }}>
              {saving ? "Saving…" : "Save (loading)"}
            </Button>
            <Button disabled>Disabled</Button>
            <Tooltip content="More actions">
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </Tooltip>
          </div>
        </Section>

        <Section title="Forms">
          <div className="grid max-w-narrow gap-4">
            <Field id="title" label="Course title" hint="Shown in the catalog." required>
              <Input id="title" placeholder="Neural Networks 101" aria-describedby={fieldDescribedBy("title", { hint: true })} />
            </Field>
            <Field id="level" label="Difficulty">
              <Select id="level" defaultValue="BEGINNER">
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </Select>
            </Field>
            <Field id="slug" label="URL" error="This URL is already used by another course.">
              <Input id="slug" defaultValue="neural-networks" aria-invalid="true" aria-describedby={fieldDescribedBy("slug", { error: true })} />
            </Field>
            <Field id="desc" label="Description">
              <Textarea id="desc" placeholder="What will students learn?" />
            </Field>
          </div>
        </Section>

        <Section title="Badges and status">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="outline">Outline</Badge>
            <CourseStatusBadge locale={locale} status="DRAFT" />
            <CourseStatusBadge locale={locale} status="PUBLISHED" />
            <CourseStatusBadge locale={locale} status="ARCHIVED" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Unpublish</CardTitle>
              </CardHeader>
              <CardContent>
                <CourseStatusConsequences locale={locale} change="unpublish" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Archive</CardTitle>
              </CardHeader>
              <CardContent>
                <CourseStatusConsequences locale={locale} change="archive" />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Cards, tabs and menus">
          <Card>
            <CardHeader>
              <CardTitle>Lesson editor</CardTitle>
              <CardDescription>Underline tabs scroll on narrow screens.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="content">
                <TabsList>
                  <TabsTrigger value="basics">Basics</TabsTrigger>
                  <TabsTrigger value="video">Video</TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="materials">Materials</TabsTrigger>
                  <TabsTrigger value="quiz">Quiz</TabsTrigger>
                </TabsList>
                <TabsContent value="content">Notes, objectives and key points.</TabsContent>
                <TabsContent value="basics">Title, description and duration.</TabsContent>
                <TabsContent value="video">Upload or link a video.</TabsContent>
                <TabsContent value="materials">Attach PDFs and slides.</TabsContent>
                <TabsContent value="quiz">Questions and correct answers.</TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Row menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Lesson</DropdownMenuLabel>
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Open drawer</Button>
              </SheetTrigger>
              <SheetContent title="Submission" description="Quick view without leaving the list.">
                <p className="text-sm text-muted-foreground">Drawer content.</p>
              </SheetContent>
            </Sheet>
            <Button variant="outline" onClick={() => toast({ title: "Course published", variant: "success", action: { label: "View", onClick: () => undefined } })}>
              Show toast
            </Button>
          </div>
        </Section>

        <Section title="Confirmation levels">
          <div className="flex flex-wrap gap-3">
            <ConfirmDialog
              trigger={<Button variant="outline">Standard</Button>}
              title="Publish this course?"
              description="It will appear in the catalog and students can enroll."
              confirmLabel="Publish course"
              onConfirm={() => toast({ title: "Published", variant: "success" })}
            />
            <ConfirmDialog
              trigger={<Button variant="outline">Impact</Button>}
              title="Delete this lesson?"
              description="The lesson and everything attached to it will be removed."
              confirmLabel="Delete lesson"
              destructive
              impact={impact}
              onOpen={() => {
                setImpact(null);
                window.setTimeout(() => setImpact([{ label: "Lesson completions", count: 42 }, { label: "Practice submissions", count: 17 }]), 800);
              }}
              onConfirm={() => toast({ title: "Deleted", variant: "error" })}
            />
            <ConfirmDialog
              trigger={<Button variant="destructive">Typed</Button>}
              title="Delete Neural Networks 101?"
              description="This deletes the course, its lessons and every student's progress in it."
              confirmLabel="Delete course"
              destructive
              impact={[{ label: "Enrolled students", count: 24 }]}
              confirmPhrase="Neural Networks 101"
              onConfirm={() => toast({ title: "Deleted", variant: "error" })}
            />
          </div>
        </Section>

        <Section title="Course roster (teacher view)">
          <p className="text-sm text-muted-foreground">
            Names and course-specific progress only. Email stays hidden until the teacher asks; there is no phone field.
          </p>
          <DataTable
            caption="Students in Neural Networks 101"
            rows={roster}
            getRowKey={(row) => row.student.id}
            columns={[
              { key: "name", header: "Student", mobile: "title", cell: (row) => <StudentIdentity student={row.student} locale={locale} /> },
              { key: "progress", header: "Progress", cell: (row) => <CourseProgressCell value={row.progress} completedLessons={row.done} totalLessons={row.total} locale={locale} /> },
              { key: "active", header: "Last active", cell: (row) => row.lastActive }
            ]}
            rowActions={() => (
              <Button variant="ghost" size="icon-sm" aria-label="Student actions">
                <MoreHorizontal />
              </Button>
            )}
          />
        </Section>

        <Section title="Feedback and states">
          <div className="flex flex-col gap-3">
            <Alert variant="info" title="Teacher preview">{"Progress isn't saved in preview."}</Alert>
            <Alert variant="warning" title="Files are publicly readable" action={<Button size="sm" variant="outline">Learn more</Button>}>
              {"Until private storage exists, upload only material you'd accept being public."}
            </Alert>
            <Alert variant="error" title="Couldn't load homework">Try again in a moment.</Alert>
            <Progress value={64} label="Course progress" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Ask about this moment <Kbd>A</Kbd>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState icon={<Inbox />} title="No submissions to review" description="New homework submissions will appear here." />
            <AccessDenied action={<Button variant="outline">Go to your dashboard</Button>} />
          </div>
          <LessonModeBanner locale={locale} mode="admin-inspection" className="rounded-xl border" />
        </Section>
      </WorkspacePage>
    </AppShell>
  );
}
