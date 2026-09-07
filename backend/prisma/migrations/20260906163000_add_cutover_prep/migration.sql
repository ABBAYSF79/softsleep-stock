-- AlterTable
ALTER TABLE `InventoryCutoverSettings` ADD COLUMN `cutoverStatus` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN `countStartedAt` DATETIME(3) NULL,
    ADD COLUMN `countFinalizedAt` DATETIME(3) NULL,
    ADD COLUMN `freezeActivatedAt` DATETIME(3) NULL,
    ADD COLUMN `freezeActivatedById` INTEGER NULL,
    ADD COLUMN `backupConfirmedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `LegacyOrderTransition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(191) NOT NULL,
    `orderId` INTEGER NULL,
    `pillowOrderId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'APPLIED',
    `notes` TEXT NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LegacyOrderTransition_source_orderId_key`(`source`, `orderId`),
    UNIQUE INDEX `LegacyOrderTransition_source_pillowOrderId_key`(`source`, `pillowOrderId`),
    INDEX `LegacyOrderTransition_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
