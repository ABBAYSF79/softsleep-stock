-- CreateTable
CREATE TABLE `CommissionSettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `defaultRate` DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    `defaultFixedAmount` DECIMAL(10, 2) NULL,
    `useFixedAmount` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
