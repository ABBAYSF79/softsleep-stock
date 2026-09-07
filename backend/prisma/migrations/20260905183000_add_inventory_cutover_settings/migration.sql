-- TASK 9 clean cutover: inventory mode boundary (LEGACY | INVENTORY). Additive only.

CREATE TABLE `InventoryCutoverSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'LEGACY',
    `cutoverAt` DATETIME(3) NULL,
    `cutoverDate` VARCHAR(191) NULL,
    `referenceType` VARCHAR(191) NULL,
    `openingFileHash` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `InventoryCutoverSettings` (`id`, `mode`, `updatedAt`, `createdAt`)
VALUES (1, 'LEGACY', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
