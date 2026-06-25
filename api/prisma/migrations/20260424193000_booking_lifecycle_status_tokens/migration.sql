-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "publicStatusToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_publicStatusToken_key" ON "Booking"("publicStatusToken");
