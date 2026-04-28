-- AlterTable: add recurrence columns to Lesson
ALTER TABLE "Lesson" ADD COLUMN "recurrenceRule" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "exceptionDate" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Lesson_seriesId_idx" ON "Lesson"("seriesId");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
