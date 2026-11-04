-- AlterTable
ALTER TABLE `Order` ADD COLUMN `reportedUntil` DATETIME(3) NULL,
    ADD COLUMN `reportReason` TEXT NULL;

-- CreateIndex
CREATE INDEX `Order_status_reportedUntil_idx` ON `Order`(`status`, `reportedUntil`);
