import { getPrisma } from "../db.js";

export async function createHouseholdWithOwner(params: {
  email: string;
  householdName: string;
  passwordHash?: string | null;
}): Promise<{ userId: string; householdId: string }> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: params.email,
        passwordHash: params.passwordHash ?? null,
      },
    });
    const household = await tx.household.create({
      data: { name: params.householdName },
    });
    await tx.householdMember.create({
      data: {
        userId: user.id,
        householdId: household.id,
        role: "OWNER",
      },
    });
    return { userId: user.id, householdId: household.id };
  });
}
