import { revalidatePath } from "next/cache";
import { CourseDifficulty, LearningGoal, TimeAvailability, UserRole } from "@prisma/client";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { completeOnboarding } from "@/server/onboarding";

function isGoal(value: string): value is LearningGoal {
  return Object.values(LearningGoal).includes(value as LearningGoal);
}

function isDifficulty(value: string): value is CourseDifficulty {
  return Object.values(CourseDifficulty).includes(value as CourseDifficulty);
}

function isTimeAvailability(value: string): value is TimeAvailability {
  return Object.values(TimeAvailability).includes(value as TimeAvailability);
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== UserRole.STUDENT) {
    return createApiErrorResponse(401, "unauthorized", "Please sign in as a student.");
  }

  const body = (await request.json()) as {
    goal?: string;
    level?: string;
    timeAvailability?: string;
    answers?: Record<string, string>;
  };

  if (
    !body.goal ||
    !body.level ||
    !body.timeAvailability ||
    !body.answers ||
    !isGoal(body.goal) ||
    !isDifficulty(body.level) ||
    !isTimeAvailability(body.timeAvailability)
  ) {
    return createApiErrorResponse(400, "invalid-input", "Please complete every onboarding step.");
  }

  const result = await completeOnboarding({
    userId: currentUser.id,
    goal: body.goal,
    level: body.level,
    timeAvailability: body.timeAvailability,
    answers: body.answers
  });

  revalidatePath("/", "layout");
  revalidatePath("/courses");
  revalidatePath("/my-learning");
  revalidatePath("/onboarding");

  return createApiSuccessResponse({
    completed: true,
    redirectPath: "/my-learning?onboarding=1",
    result
  });
}
