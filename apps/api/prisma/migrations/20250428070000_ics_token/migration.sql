-- AlterTable: add icsToken to Household
ALTER TABLE "Household" ADD COLUMN "icsToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Household_icsToken_key" ON "Household"("icsToken");
