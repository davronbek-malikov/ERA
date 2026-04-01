"use server";

import { CourseDifficulty, PublicationStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createUserSession,
  getCurrentUser,
  hashPassword,
  normalizePhone,
  verifyPassword
} from "@/lib/auth";
import { getActionErrorRedirectPath } from "@/lib/app-errors";
import {
  assertCourseManagementAccess,
  getInstructorRecordForUser,
  isAdmin
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError } from "@/lib/server-data";
import { getSupabaseStorageConfig } from "@/lib/storage";
import { normalizeList, slugify } from "@/lib/slugs";

async function createUniqueCourseSlug(title: string) {
  const baseSlug = slugify(title) || `course-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;

  while (await prisma.course.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function createUniqueLessonSlug(courseId: string, title: string) {
  const baseSlug = slugify(title) || `lesson-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;

  while (
    await prisma.lesson.findFirst({
      where: { courseId, slug },
      select: { id: true }
    })
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function createUniqueSubjectSlug(name: string, providedSlug?: string) {
  const baseSlug = slugify(providedSlug || name) || `subject-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;

  while (await prisma.subject.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function createUniqueCategorySlug(subjectId: string, name: string, providedSlug?: string) {
  const baseSlug = slugify(providedSlug || name) || `category-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;

  while (
    await prisma.category.findFirst({
      where: { subjectId, slug },
      select: { id: true }
    })
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function createUniqueInstructorSlug(name: string, providedSlug?: string) {
  const baseSlug = slugify(providedSlug || name) || `instructor-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;

  while (await prisma.instructor.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asPositiveNumber(value: string, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePublicationStatus(value: string) {
  return Object.values(PublicationStatus).includes(value as PublicationStatus)
    ? (value as PublicationStatus)
    : PublicationStatus.PUBLISHED;
}

function handleDatabaseError(error: unknown, path: string) {
  redirect(getActionErrorRedirectPath(path, error));
}

async function requireCurrentStudioUser(path: string) {
  const currentUser = await getCurrentUser();

  if (!currentUser || (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.INSTRUCTOR)) {
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }

  return currentUser;
}

async function requireAdminUser(path: string) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }

  if (!isAdmin(currentUser.role)) {
    redirect(`${path}?error=forbidden`);
  }

  return currentUser;
}

async function resolveManagedInstructorId(
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>,
  requestedInstructorId: string,
  path: string
) {
  if (!currentUser) {
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }

  if (isAdmin(currentUser.role)) {
    if (!requestedInstructorId) {
      redirect(`${path}?error=missing-course-fields`);
    }

    return requestedInstructorId;
  }

  const instructor = await getInstructorRecordForUser(currentUser);

  if (!instructor) {
    redirect(`${path}?error=missing-instructor-profile`);
  }

  return instructor.id;
}

async function revalidateCourseById(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { slug: true }
  });

  revalidatePath("/courses");
  if (course) {
    revalidatePath(`/courses/${course.slug}`);
  }
}

async function deleteStoredObject(storagePath?: string | null) {
  if (!storagePath) {
    return;
  }

  const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseStorageConfig();
  const deleteResponse = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prefixes: [storagePath]
    })
  });

  if (!deleteResponse.ok) {
    const payload = await deleteResponse.json().catch(() => null);
    const errorMessage =
      typeof payload?.message === "string" ? payload.message : "Could not delete the uploaded file.";
    throw new Error(errorMessage);
  }
}

export async function createCourseAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/courses");
  const title = asString(formData, "title");
  const subtitle = asString(formData, "subtitle");
  const shortDescription = asString(formData, "shortDescription");
  const description = asString(formData, "description");
  const categoryId = asString(formData, "categoryId");
  const requestedInstructorId = asString(formData, "instructorId");
  const thumbnailUrl = asString(formData, "thumbnailUrl");
  const promoVideoUrl = asString(formData, "promoVideoUrl");
  const outcomesInput = asString(formData, "outcomes");
  const difficultyValue = asString(formData, "difficulty");
  const statusValue = asString(formData, "status");
  const isFeatured = formData.get("isFeatured") === "on";
  const isPopular = formData.get("isPopular") === "on";

  if (!title || !categoryId) {
    redirect("/admin/courses?error=missing-course-fields");
  }

  const instructorId = await resolveManagedInstructorId(
    currentUser,
    requestedInstructorId,
    "/admin/courses"
  );
  const difficulty = Object.values(CourseDifficulty).includes(difficultyValue as CourseDifficulty)
    ? (difficultyValue as CourseDifficulty)
    : CourseDifficulty.BEGINNER;
  const status = parsePublicationStatus(statusValue);
  const outcomes = normalizeList(outcomesInput);
  let slug = "";

  try {
    slug = await createUniqueCourseSlug(title);
    await prisma.course.create({
      data: {
        title,
        subtitle: subtitle || null,
        slug,
        shortDescription: shortDescription || description || null,
        description: description || null,
        thumbnailUrl: thumbnailUrl || null,
        promoVideoUrl: promoVideoUrl || null,
        difficulty,
        outcomes:
          outcomes.length > 0
            ? outcomes
            : [
                "Understand the core ideas taught in this course.",
                "Apply the lesson structure to independent study.",
                "Build confidence through guided video learning."
              ],
        isFeatured,
        isPopular,
        status,
        categoryId,
        instructorId
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/courses");
  }

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  redirect("/admin/courses?created=course");
}

export async function updateCourseAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/courses");
  const id = asString(formData, "id");
  const title = asString(formData, "title");
  const subtitle = asString(formData, "subtitle");
  const shortDescription = asString(formData, "shortDescription");
  const description = asString(formData, "description");
  const categoryId = asString(formData, "categoryId");
  const requestedInstructorId = asString(formData, "instructorId");
  const thumbnailUrl = asString(formData, "thumbnailUrl");
  const promoVideoUrl = asString(formData, "promoVideoUrl");
  const outcomesInput = asString(formData, "outcomes");
  const difficultyValue = asString(formData, "difficulty");
  const statusValue = asString(formData, "status");
  const isFeatured = formData.get("isFeatured") === "on";
  const isPopular = formData.get("isPopular") === "on";

  if (!id || !title || !categoryId) {
    redirect("/admin/courses?error=missing-course-fields");
  }

  try {
    await assertCourseManagementAccess(id, currentUser);
  } catch {
    redirect("/admin/courses?error=forbidden");
  }

  const instructorId = await resolveManagedInstructorId(
    currentUser,
    requestedInstructorId,
    "/admin/courses"
  );

  const difficulty = Object.values(CourseDifficulty).includes(difficultyValue as CourseDifficulty)
    ? (difficultyValue as CourseDifficulty)
    : CourseDifficulty.BEGINNER;
  const status = parsePublicationStatus(statusValue);
  const outcomes = normalizeList(outcomesInput);
  const existingCourse = await prisma.course.findUnique({
    where: { id },
    select: {
      slug: true
    }
  });

  try {
    await prisma.course.update({
      where: { id },
      data: {
        title,
        subtitle: subtitle || null,
        shortDescription: shortDescription || description || null,
        description: description || null,
        thumbnailUrl: thumbnailUrl || null,
        promoVideoUrl: promoVideoUrl || null,
        difficulty,
        outcomes:
          outcomes.length > 0
            ? outcomes
            : [
                "Understand the core ideas taught in this course.",
                "Apply the lesson structure to independent study.",
                "Build confidence through guided video learning."
              ],
        isFeatured,
        isPopular,
        status,
        categoryId,
        instructorId
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/courses");
  }

  revalidatePath("/");
  revalidatePath("/courses");
  if (existingCourse) {
    revalidatePath(`/courses/${existingCourse.slug}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  redirect("/admin/courses?saved=course");
}

export async function createLessonAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/lessons");
  const courseId = asString(formData, "courseId");
  const title = asString(formData, "title");
  const description = asString(formData, "description");
  const videoUrl = asString(formData, "videoUrl");
  const duration = asString(formData, "duration");
  const orderValue = asString(formData, "position");

  if (!courseId || !title) {
    redirect("/admin/lessons?error=missing-lesson-fields");
  }

  try {
    await assertCourseManagementAccess(courseId, currentUser);
  } catch {
    redirect("/admin/lessons?error=forbidden");
  }

  try {
    const parsedPosition = Number(orderValue);
    const existingLessonCount = await prisma.lesson.count({ where: { courseId } });

    await prisma.lesson.create({
      data: {
        courseId,
        title,
        slug: await createUniqueLessonSlug(courseId, title),
        description: description || null,
        videoUrl: videoUrl || null,
        duration: duration || null,
        position:
          Number.isFinite(parsedPosition) && parsedPosition > 0
            ? parsedPosition
            : existingLessonCount + 1,
        status: PublicationStatus.PUBLISHED
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/lessons");
  }

  await revalidateCourseById(courseId);
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/progress");
  redirect("/admin/lessons?created=lesson");
}

export async function updateLessonAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/lessons");
  const id = asString(formData, "id");
  const courseId = asString(formData, "courseId");
  const title = asString(formData, "title");
  const description = asString(formData, "description");
  const videoUrl = asString(formData, "videoUrl");
  const duration = asString(formData, "duration");
  const orderValue = asString(formData, "position");

  if (!id || !courseId || !title) {
    redirect("/admin/lessons?error=missing-lesson-fields");
  }

  const existingLesson = await prisma.lesson.findUnique({
    where: { id },
    select: { courseId: true }
  });

  if (!existingLesson) {
    redirect("/admin/lessons?error=delete-failed");
  }

  try {
    await assertCourseManagementAccess(existingLesson.courseId, currentUser);
    await assertCourseManagementAccess(courseId, currentUser);
  } catch {
    redirect("/admin/lessons?error=forbidden");
  }

  try {
    const parsedPosition = Number(orderValue);

    await prisma.lesson.update({
      where: { id },
      data: {
        courseId,
        title,
        description: description || null,
        videoUrl: videoUrl || null,
        duration: duration || null,
        position: Number.isFinite(parsedPosition) && parsedPosition > 0 ? parsedPosition : 1
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/lessons");
  }

  await revalidateCourseById(existingLesson.courseId);
  if (existingLesson.courseId !== courseId) {
    await revalidateCourseById(courseId);
  }
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/materials");
  revalidatePath("/admin/progress");
  redirect("/admin/lessons?saved=lesson");
}

export async function createMaterialAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/materials");
  const courseId = asString(formData, "courseId");
  const lessonId = asString(formData, "lessonId");
  const title = asString(formData, "title");
  const description = asString(formData, "description");
  const fileUrl = asString(formData, "fileUrl");
  const storagePath = asString(formData, "storagePath");
  const mimeType = asString(formData, "mimeType");
  const positionValue = asString(formData, "position");

  if (!courseId || !title || !fileUrl) {
    redirect("/admin/materials?error=missing-material-fields");
  }

  try {
    await assertCourseManagementAccess(courseId, currentUser);
  } catch {
    redirect("/admin/materials?error=forbidden");
  }

  if (lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true }
    });

    if (!lesson || lesson.courseId !== courseId) {
      redirect("/admin/materials?error=invalid-lesson");
    }
  }

  try {
    const existingCount = await prisma.courseMaterial.count({
      where: {
        courseId,
        ...(lessonId ? { lessonId } : { lessonId: null })
      }
    });

    await prisma.courseMaterial.create({
      data: {
        courseId,
        lessonId: lessonId || null,
        createdByUserId: currentUser.id,
        title,
        description: description || null,
        fileUrl,
        storagePath: storagePath || null,
        mimeType: mimeType || null,
        position: asPositiveNumber(positionValue, existingCount + 1)
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/materials");
  }

  await revalidateCourseById(courseId);
  revalidatePath("/admin/materials");
  redirect("/admin/materials?created=material");
}

export async function updateMaterialAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/materials");
  const id = asString(formData, "id");
  const courseId = asString(formData, "courseId");
  const lessonId = asString(formData, "lessonId");
  const title = asString(formData, "title");
  const description = asString(formData, "description");
  const fileUrl = asString(formData, "fileUrl");
  const storagePath = asString(formData, "storagePath");
  const mimeType = asString(formData, "mimeType");
  const position = asPositiveNumber(asString(formData, "position"), 1);

  if (!id || !courseId || !title || !fileUrl) {
    redirect("/admin/materials?error=missing-material-fields");
  }

  const material = await prisma.courseMaterial.findUnique({
    where: { id },
    select: {
      courseId: true,
      storagePath: true
    }
  });

  if (!material) {
    redirect("/admin/materials?error=delete-failed");
  }

  try {
    await assertCourseManagementAccess(material.courseId, currentUser);
    await assertCourseManagementAccess(courseId, currentUser);
  } catch {
    redirect("/admin/materials?error=forbidden");
  }

  if (lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true }
    });

    if (!lesson || lesson.courseId !== courseId) {
      redirect("/admin/materials?error=invalid-lesson");
    }
  }

  try {
    await prisma.courseMaterial.update({
      where: { id },
      data: {
        courseId,
        lessonId: lessonId || null,
        title,
        description: description || null,
        fileUrl,
        storagePath: storagePath || null,
        mimeType: mimeType || null,
        position
      }
    });

    if (material.storagePath && material.storagePath !== storagePath) {
      await deleteStoredObject(material.storagePath);
    }
  } catch (error) {
    handleDatabaseError(error, "/admin/materials");
  }

  await revalidateCourseById(material.courseId);
  if (material.courseId !== courseId) {
    await revalidateCourseById(courseId);
  }
  revalidatePath("/admin/materials");
  redirect("/admin/materials?saved=material");
}

export async function deleteMaterialAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/materials");
  const id = asString(formData, "id");

  if (!id) {
    redirect("/admin/materials?error=delete-failed");
  }

  const material = await prisma.courseMaterial.findUnique({
    where: { id },
    select: {
      courseId: true,
      storagePath: true
    }
  });

  if (!material) {
    redirect("/admin/materials?error=delete-failed");
  }

  try {
    await assertCourseManagementAccess(material.courseId, currentUser);
  } catch {
    redirect("/admin/materials?error=forbidden");
  }

  try {
    await prisma.courseMaterial.delete({ where: { id } });
    await deleteStoredObject(material.storagePath);
  } catch (error) {
    handleDatabaseError(error, "/admin/materials");
  }

  await revalidateCourseById(material.courseId);
  revalidatePath("/admin/materials");
  redirect("/admin/materials?deleted=material");
}

export async function createSubjectAction(formData: FormData) {
  await requireAdminUser("/admin/subjects");
  const name = asString(formData, "name");
  const requestedSlug = asString(formData, "slug");
  const description = asString(formData, "description");
  const thumbnailUrl = asString(formData, "thumbnailUrl");
  const position = asPositiveNumber(asString(formData, "position"));
  const status = parsePublicationStatus(asString(formData, "status"));
  let slug = "";

  if (!name) {
    redirect("/admin/subjects?error=missing-subject-fields");
  }

  try {
    slug = await createUniqueSubjectSlug(name, requestedSlug);
    await prisma.subject.create({
      data: {
        name,
        slug,
        description: description || null,
        thumbnailUrl: thumbnailUrl || null,
        position,
        status
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/subjects");
  }

  revalidatePath("/");
  revalidatePath("/subjects");
  revalidatePath(`/subjects/${slug}`);
  revalidatePath("/admin/subjects");
  redirect("/admin/subjects?created=subject");
}

export async function createCategoryAction(formData: FormData) {
  await requireAdminUser("/admin/categories");
  const name = asString(formData, "name");
  const requestedSlug = asString(formData, "slug");
  const subjectId = asString(formData, "subjectId");
  const description = asString(formData, "description");
  const position = asPositiveNumber(asString(formData, "position"));
  const status = parsePublicationStatus(asString(formData, "status"));

  if (!name || !subjectId) {
    redirect("/admin/categories?error=missing-category-fields");
  }

  try {
    await prisma.category.create({
      data: {
        name,
        slug: await createUniqueCategorySlug(subjectId, name, requestedSlug),
        subjectId,
        description: description || null,
        position,
        status
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/categories");
  }

  revalidatePath("/subjects");
  revalidatePath("/courses");
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { slug: true }
  });
  if (subject) {
    revalidatePath(`/subjects/${subject.slug}`);
  }
  revalidatePath("/admin/categories");
  redirect("/admin/categories?created=category");
}

export async function createInstructorAction(formData: FormData) {
  await requireAdminUser("/admin/instructors");
  const name = asString(formData, "name");
  const requestedSlug = asString(formData, "slug");
  const title = asString(formData, "title");
  const email = asString(formData, "email");
  const imageUrl = asString(formData, "imageUrl");
  const bio = asString(formData, "bio");

  if (!name) {
    redirect("/admin/instructors?error=missing-instructor-fields");
  }

  try {
    await prisma.instructor.create({
      data: {
        name,
        slug: await createUniqueInstructorSlug(name, requestedSlug),
        title: title || null,
        email: email || null,
        imageUrl: imageUrl || null,
        bio: bio || null
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/instructors");
  }

  revalidatePath("/courses");
  revalidatePath("/admin/instructors");
  redirect("/admin/instructors?created=instructor");
}

export async function createUserAction(formData: FormData) {
  await requireAdminUser("/admin/users");
  const name = asString(formData, "name");
  const email = asString(formData, "email");
  const phone = normalizePhone(asString(formData, "phone"));
  const password = asString(formData, "password");
  const image = asString(formData, "image");
  const roleValue = asString(formData, "role");
  const status = asString(formData, "status") || "ACTIVE";
  const instructorId = asString(formData, "instructorId");

  if (!name || !email || !password) {
    redirect("/admin/users?error=missing-user-fields");
  }

  const role = Object.values(UserRole).includes(roleValue as UserRole)
    ? (roleValue as UserRole)
    : UserRole.STUDENT;

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        passwordHash: await hashPassword(password),
        image: image || null,
        role,
        status
      }
    });

    if (role === UserRole.INSTRUCTOR) {
      if (instructorId) {
        await prisma.instructor.update({
          where: { id: instructorId },
          data: {
            userId: user.id,
            email: email.toLowerCase(),
            name
          }
        });
      } else {
        await prisma.instructor.updateMany({
          where: {
            email: email.toLowerCase(),
            userId: null
          },
          data: {
            userId: user.id,
            name
          }
        });
      }
    }
  } catch (error) {
    handleDatabaseError(error, "/admin/users");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?created=user");
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdminUser("/admin/settings");
  const platformName = asString(formData, "platformName") || "ERA Academy";
  const supportEmail = asString(formData, "supportEmail");
  const defaultPromoVideoUrl = asString(formData, "defaultPromoVideoUrl");
  const description = asString(formData, "description");

  try {
    await prisma.siteSetting.upsert({
      where: { id: "default" },
      update: {
        platformName,
        supportEmail: supportEmail || null,
        defaultPromoVideoUrl: defaultPromoVideoUrl || null,
        description: description || null
      },
      create: {
        id: "default",
        platformName,
        supportEmail: supportEmail || null,
        defaultPromoVideoUrl: defaultPromoVideoUrl || null,
        description: description || null
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/settings");
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=settings");
}

export async function updateAccountProfileAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in?next=/admin/settings");
  }

  const name = asString(formData, "name");
  const email = asString(formData, "email").toLowerCase();
  const phone = normalizePhone(asString(formData, "phone"));

  if (!name || !email) {
    redirect("/admin/settings?error=missing-account-fields");
  }

  try {
    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name,
        email,
        phone: phone || null
      }
    });

    if (currentUser.role === UserRole.INSTRUCTOR) {
      const instructor = await getInstructorRecordForUser(currentUser);

      if (instructor) {
        await prisma.instructor.update({
          where: { id: instructor.id },
          data: {
            name,
            email
          }
        });
      }
    }

    await createUserSession(currentUser.id, currentUser.role, name);
  } catch (error) {
    handleDatabaseError(error, "/admin/settings");
    redirect("/admin/settings?error=account-update-failed");
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=account");
}

export async function changePasswordAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/sign-in?next=/admin/settings");
  }

  const currentPassword = asString(formData, "currentPassword");
  const newPassword = asString(formData, "newPassword");
  const confirmPassword = asString(formData, "confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect("/admin/settings?error=missing-password-fields");
  }

  if (newPassword.length < 8) {
    redirect("/admin/settings?error=password-too-short");
  }

  if (newPassword !== confirmPassword) {
    redirect("/admin/settings?error=password-mismatch");
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      passwordHash: true
    }
  });

  if (!user?.passwordHash) {
    redirect("/admin/settings?error=password-change-failed");
  }

  const validPassword = await verifyPassword(currentPassword, user.passwordHash);
  if (!validPassword) {
    redirect("/admin/settings?error=invalid-current-password");
  }

  try {
    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash: await hashPassword(newPassword)
      }
    });
  } catch (error) {
    handleDatabaseError(error, "/admin/settings");
    redirect("/admin/settings?error=password-change-failed");
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=password");
}

export async function deleteSubjectAction(formData: FormData) {
  await requireAdminUser("/admin/subjects");
  const id = asString(formData, "id");
  if (!id) {
    redirect("/admin/subjects?error=delete-failed");
  }
  const subject = await prisma.subject.findUnique({
    where: { id },
    select: { slug: true }
  });
  try {
    await prisma.subject.delete({ where: { id } });
  } catch (error) {
    handleDatabaseError(error, "/admin/subjects");
  }
  revalidatePath("/");
  revalidatePath("/subjects");
  if (subject) {
    revalidatePath(`/subjects/${subject.slug}`);
  }
  revalidatePath("/admin/subjects");
  redirect("/admin/subjects?deleted=subject");
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAdminUser("/admin/categories");
  const id = asString(formData, "id");
  if (!id) {
    redirect("/admin/categories?error=delete-failed");
  }
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      subject: {
        select: {
          slug: true
        }
      }
    }
  });
  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    handleDatabaseError(error, "/admin/categories");
  }
  revalidatePath("/subjects");
  revalidatePath("/courses");
  if (category) {
    revalidatePath(`/subjects/${category.subject.slug}`);
  }
  revalidatePath("/admin/categories");
  redirect("/admin/categories?deleted=category");
}

export async function deleteCourseAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/courses");
  const id = asString(formData, "id");
  if (!id) {
    redirect("/admin/courses?error=delete-failed");
  }

  try {
    await assertCourseManagementAccess(id, currentUser);
  } catch {
    redirect("/admin/courses?error=forbidden");
  }

  const course = await prisma.course.findUnique({
    where: { id },
    select: { slug: true }
  });
  try {
    await prisma.course.delete({ where: { id } });
  } catch (error) {
    handleDatabaseError(error, "/admin/courses");
  }
  revalidatePath("/");
  revalidatePath("/courses");
  if (course) {
    revalidatePath(`/courses/${course.slug}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/materials");
  revalidatePath("/admin/progress");
  redirect("/admin/courses?deleted=course");
}

export async function deleteLessonAction(formData: FormData) {
  const currentUser = await requireCurrentStudioUser("/admin/lessons");
  const id = asString(formData, "id");
  if (!id) {
    redirect("/admin/lessons?error=delete-failed");
  }
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: {
      courseId: true,
      course: {
        select: {
          slug: true
        }
      }
    }
  });

  if (!lesson) {
    redirect("/admin/lessons?error=delete-failed");
  }

  try {
    await assertCourseManagementAccess(lesson.courseId, currentUser);
  } catch {
    redirect("/admin/lessons?error=forbidden");
  }
  try {
    await prisma.lesson.delete({ where: { id } });
  } catch (error) {
    handleDatabaseError(error, "/admin/lessons");
  }
  revalidatePath("/courses");
  if (lesson) {
    revalidatePath(`/courses/${lesson.course.slug}`);
  }
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/materials");
  revalidatePath("/admin/progress");
  redirect("/admin/lessons?deleted=lesson");
}

export async function deleteInstructorAction(formData: FormData) {
  await requireAdminUser("/admin/instructors");
  const id = asString(formData, "id");
  if (!id) {
    redirect("/admin/instructors?error=delete-failed");
  }
  try {
    await prisma.instructor.delete({ where: { id } });
  } catch (error) {
    if (isDatabaseOfflineError(error)) {
      redirect("/admin/instructors?error=database-offline");
    }
    redirect("/admin/instructors?error=instructor-in-use");
  }
  revalidatePath("/courses");
  revalidatePath("/admin/instructors");
  redirect("/admin/instructors?deleted=instructor");
}

export async function deleteUserAction(formData: FormData) {
  await requireAdminUser("/admin/users");
  const id = asString(formData, "id");
  if (!id) {
    redirect("/admin/users?error=delete-failed");
  }
  try {
    await prisma.user.delete({ where: { id } });
  } catch (error) {
    handleDatabaseError(error, "/admin/users");
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  redirect("/admin/users?deleted=user");
}
