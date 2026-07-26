import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export type AuthenticatedRequest = Request & {
  userId?: string;
  clerkId?: string;
};

/**
 * Requires a valid Clerk session / Bearer JWT.
 * Upserts the Prisma User on first authenticated request.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth(req);
    const clerkId = auth.userId;

    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let email: string | undefined;
    let name: string | undefined;

    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      email = clerkUser.emailAddresses[0]?.emailAddress;
      name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        undefined;
    } catch {
      // Session is valid even if profile fetch fails; upsert with clerkId only.
    }

    const user = await prisma.user.upsert({
      where: { clerkId },
      create: { clerkId, email, name },
      update: {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
    });

    req.clerkId = clerkId;
    req.userId = user.id;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ error: "Unauthorized" });
  }
}
