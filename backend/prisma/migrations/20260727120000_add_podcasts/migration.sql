-- CreateEnum
CREATE TYPE "PodcastStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Podcast" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PodcastStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "script" JSONB,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "durationSeconds" INTEGER,
    "sourceIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Podcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Podcast_notebookId_idx" ON "Podcast"("notebookId");

-- CreateIndex
CREATE INDEX "Podcast_status_idx" ON "Podcast"("status");

-- AddForeignKey
ALTER TABLE "Podcast" ADD CONSTRAINT "Podcast_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
