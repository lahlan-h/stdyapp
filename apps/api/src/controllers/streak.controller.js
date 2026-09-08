import * as streakService from "../services/streak.service.js";

/**
 * Thin by design, and thinner than most: this resource is READ-ONLY over the
 * wire. There is no create, update or remove here because there is no route
 * that would reach one - a streak is written by endSession, never by a client.
 * See the model comment in schema.prisma.
 */

export const getMine = async (req, res, next) => {
  try {
    const streak = await streakService.getMyStreak(req.user.id);
    res.status(200).json(streak);
  } catch (err) {
    next(err);
  }
};

export const getForUser = async (req, res, next) => {
  try {
    const streak = await streakService.getStreakForUser(req.validated.params.userId);
    res.status(200).json(streak);
  } catch (err) {
    next(err);
  }
};
