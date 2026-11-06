import Link from "next/link";
import { createCourseAction, deleteCourseAction, updateCourseAction } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MediaUploadField } from "@/components/admin/media-upload-field";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { RowDeleteAction, RowEditLink } from "@/components/admin/row-actions";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getAdminCourses, getAdminFormOptions } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminCoursesPageProps = {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    deleted?: string;
    error?: string;
    edit?: string;
  }>;
};

export default async function AdminCoursesPage({ searchParams }: AdminCoursesPageProps) {
  const params = await searchParams;
  const [courses, options] = await Promise.all([getAdminCourses(), getAdminFormOptions()]);
  const editingCourse = params.edit ? courses.find((course) => course.id === params.edit) ?? null : null;

  return (
    <AdminShell currentPath="/admin/courses">
      <AdminPageHeader
        eyebrow="Courses"
        title="Manage course publishing and curriculum setup."
        description="Use the course workspace to define metadata, assign instructors, and prepare the student-facing catalog."
      />

      <div className="grid gap-8">
        {params.created === "course" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
            Course created successfully. It is now available in the catalog if published.
          </div>
        ) : null}
        {params.saved === "course" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
            Course updated successfully.
          </div>
        ) : null}
        {params.deleted === "course" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
            Course deleted successfully.
          </div>
        ) : null}
        {params.error === "invalid-url" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            Use full http(s) links for the thumbnail and promo video.
          </div>
        ) : null}
        {params.error === "missing-course-fields" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            Please fill in the course title, category, and instructor before saving.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
            The site is running in local demo mode because PostgreSQL is offline. Browsing works,
            but saving new courses will need the database running again.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            You can only manage courses assigned to your instructor profile.
          </div>
        ) : null}
        {params.error === "missing-instructor-profile" ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
            Your instructor account is not linked to an instructor profile yet, so course management is unavailable.
          </div>
        ) : null}
        {params.error === "duplicate-record" || params.error === "validation-failed" || params.error === "action-failed" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            We could not save that course. Review the form values and try again.
          </div>
        ) : null}
        {params.error === "invalid-reference" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            The selected instructor or category could not be found.
          </div>
        ) : null}

        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            We could not delete that course.
          </div>
        ) : null}

        <ResourceTable
          title="Course Records"
          columns={["Title", "Instructor", "Subject", "Difficulty", "Lessons", "Students", "Status", "Actions"]}
          rows={courses.map((course) => [
            course.title,
            course.instructor.name,
            course.category.subject.name,
            course.difficulty,
            String(course._count.lessons),
            String(course._count.enrollments),
            course.status,
            <div key={`actions-${course.id}`} className="flex gap-2">
              <RowEditLink href={`/admin/courses?edit=${course.id}`} />
              <RowDeleteAction action={deleteCourseAction} id={course.id} />
            </div>
          ])}
        />

        {editingCourse ? (
          <FormShell
            title={`Edit Course: ${editingCourse.title}`}
            description="Update the course details, replace media, and save changes to the live catalog."
          >
            <form action={updateCourseAction} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="id" value={editingCourse.id} />
              <Input name="title" placeholder="Title" required defaultValue={editingCourse.title} />
              <Input name="subtitle" placeholder="Subtitle" defaultValue={editingCourse.subtitle ?? ""} />
              <div className="md:col-span-2">
                <Input
                  name="shortDescription"
                  placeholder="Short description for course cards"
                  required
                  defaultValue={editingCourse.shortDescription ?? ""}
                />
              </div>
              <div className="md:col-span-2">
                <Textarea
                  name="description"
                  placeholder="Full course description"
                  defaultValue={editingCourse.description ?? ""}
                />
              </div>
              <select
                name="categoryId"
                required
                defaultValue={editingCourse.categoryId}
                className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select category</option>
                {options.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.subject.name} / {category.name}
                  </option>
                ))}
              </select>
              <select
                name="instructorId"
                required
                defaultValue={editingCourse.instructorId}
                className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select instructor</option>
                {options.instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </option>
                ))}
              </select>
              <select
                name="difficulty"
                defaultValue={editingCourse.difficulty}
                className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select difficulty</option>
                <option>BEGINNER</option>
                <option>INTERMEDIATE</option>
                <option>ADVANCED</option>
              </select>
              <select
                name="status"
                defaultValue={editingCourse.status}
                className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select status</option>
                {options.statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <MediaUploadField
                name="thumbnailUrl"
                label="Course thumbnail"
                placeholder="Thumbnail image URL"
                uploadFolder="course-thumbnails"
                mediaType="image"
                helperText="Preview, replace, or remove the current course thumbnail."
                initialValue={editingCourse.thumbnailUrl ?? ""}
              />
              <MediaUploadField
                name="promoVideoUrl"
                label="Promo video"
                placeholder="Promo video URL"
                uploadFolder="course-promo-videos"
                mediaType="video"
                helperText="Preview, replace, or remove the current promo video."
                initialValue={editingCourse.promoVideoUrl ?? ""}
              />
              <div className="md:col-span-2">
                <Textarea
                  name="outcomes"
                  placeholder="Learning outcomes, one per line"
                  defaultValue={editingCourse.outcomes.join("\n")}
                />
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  name="isFeatured"
                  className="h-4 w-4"
                  defaultChecked={editingCourse.isFeatured}
                />
                Feature this course on the homepage
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  name="isPopular"
                  className="h-4 w-4"
                  defaultChecked={editingCourse.isPopular}
                />
                Mark this course as popular
              </label>
              <div className="md:col-span-2 flex gap-3">
                <Button type="submit">Save Changes</Button>
                <Link
                  href="/admin/courses"
                  className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-transparent px-5 text-sm font-medium transition-all duration-300 hover:bg-card/80 h-11")}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </FormShell>
        ) : null}

        <FormShell
          title="Create Course"
          description="Create a real course record, publish it to the catalog, and attach a promo video URL when you are ready."
        >
          <form action={createCourseAction} className="grid gap-4 md:grid-cols-2">
            <Input name="title" placeholder="Title" required />
            <Input name="subtitle" placeholder="Subtitle" />
            <div className="md:col-span-2">
              <Input
                name="shortDescription"
                placeholder="Short description for course cards"
                required
              />
            </div>
            <div className="md:col-span-2">
              <Textarea name="description" placeholder="Full course description" />
            </div>
            <select
              name="categoryId"
              required
              className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select category</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.subject.name} / {category.name}
                </option>
              ))}
            </select>
            <select
              name="instructorId"
              required
              className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select instructor</option>
              {options.instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </select>
            <select
              name="difficulty"
              className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="BEGINNER"
            >
              <option value="">Select difficulty</option>
              <option>BEGINNER</option>
              <option>INTERMEDIATE</option>
              <option>ADVANCED</option>
            </select>
            <MediaUploadField
              name="thumbnailUrl"
              label="Course thumbnail"
              placeholder="Thumbnail image URL"
              uploadFolder="course-thumbnails"
              mediaType="image"
              helperText="Paste an existing image URL or upload a local thumbnail image."
            />
            <MediaUploadField
              name="promoVideoUrl"
              label="Promo video"
              placeholder="Promo video URL"
              uploadFolder="course-promo-videos"
              mediaType="video"
            />
            <select
              name="status"
              className="h-12 rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="PUBLISHED"
            >
              <option value="">Select status</option>
              {options.statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className="md:col-span-2">
              <Textarea
                name="outcomes"
                placeholder="Learning outcomes, one per line"
              />
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm">
              <input type="checkbox" name="isFeatured" className="h-4 w-4" />
              Feature this course on the homepage
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm">
              <input type="checkbox" name="isPopular" className="h-4 w-4" />
              Mark this course as popular
            </label>
            <div className="md:col-span-2 rounded-2xl bg-secondary/45 px-4 py-3 text-sm text-muted-foreground">
              You can paste a public video link or upload a local promo video file directly to
              Supabase Storage from this form.
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Save Course</Button>
            </div>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
