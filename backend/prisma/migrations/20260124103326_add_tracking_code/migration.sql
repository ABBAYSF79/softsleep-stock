-- AlterTable
ALTER TABLE `order` ADD COLUMN `trackingCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `stockhistory` MODIFY `type` ENUM('INITIAL', 'ORDER', 'RETURN', 'ADJUSTMENT', 'SUPPLY') NOT NULL;
