import { prisma } from "@stdyapp/core";

/**
 * Scoped by userId throughout, exactly as goal.repository.js is, and here the
 * @unique on streaks.userId makes it the only possible scoping: there is one
 * row per user and the user id addresses it completely.
 *
 * Note what is NOT in this file: no updateStreak taking arbitrary data, and no
 * deleteStreak. The only write is the upsert below, which recordStudyDay owns.
 * A generic update here would be an invitation to expose it through a route,
 * and the model comment in schema.prisma explains why that must not happen.
 */

export const findStreakByUser = (userId) => {
  return prisma.streak.findUnique({ where: { userId } });
};

/**
 * Writes the counter and the day it was last moved.
 *
 * upsert for the reason upsertGoal gives, plus one specific to this caller: a
 * user's very first finished session must create the row, and every subsequent
 * one updates it. Splitting that into a branch in the service would put a
 * read-then-write race in the path of the single most common write in the app.
 *
 * The values are computed in streak.service.js, never here. This function
 * deliberately holds no streak RULES - if it did, the "did they study
 * yesterday" logic would live in two places the first time anything else needed
 * to read it.
 *
 * @param {{ userId: string, currentCount: number, lastActiveDate: Date }} input
 */
export const upsertStreak = ({ userId, currentCount, lastActiveDate }) => {
  return prisma.streak.upsert({
    where: { userId },
    create: { userId, currentCount, lastActiveDate },
    update: { currentCount, lastActiveDate },
  });
};
