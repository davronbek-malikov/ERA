import { ActivityType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

export async function trackUserActivity(input: {
  userId: string;
  type: ActivityType;
  message: string;
  context?: Prisma.InputJsonValue;
}) {
  return retryOnDatabaseFailure(() =>
    prisma.activityLog.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        context: input.context
      }
    })
  );
}
