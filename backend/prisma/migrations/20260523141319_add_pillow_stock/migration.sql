-- CreateTable
CREATE TABLE `Pillow` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `stock` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PillowStockHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pillowId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `type` ENUM('INITIAL', 'SUPPLY', 'OUTGOING', 'ADJUSTMENT') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `previousStock` INTEGER NOT NULL,
    `newStock` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,

    INDEX `PillowStockHistory_userId_idx`(`userId`),
    INDEX `PillowStockHistory_pillowId_idx`(`pillowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PillowStockHistory` ADD CONSTRAINT `PillowStockHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PillowStockHistory` ADD CONSTRAINT `PillowStockHistory_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
