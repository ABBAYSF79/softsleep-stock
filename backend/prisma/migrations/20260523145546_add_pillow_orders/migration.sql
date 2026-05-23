-- CreateTable
CREATE TABLE `PillowOrder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `deliveryServiceId` INTEGER NULL,
    `status` ENUM('PENDING', 'IN_PROCESS', 'DELIVERED', 'RETURNED') NOT NULL DEFAULT 'PENDING',
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PillowOrder_userId_idx`(`userId`),
    INDEX `PillowOrder_deliveryServiceId_idx`(`deliveryServiceId`),
    INDEX `PillowOrder_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PillowOrderItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `pillowId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,

    INDEX `PillowOrderItem_orderId_idx`(`orderId`),
    INDEX `PillowOrderItem_pillowId_idx`(`pillowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PillowOrder` ADD CONSTRAINT `PillowOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PillowOrder` ADD CONSTRAINT `PillowOrder_deliveryServiceId_fkey` FOREIGN KEY (`deliveryServiceId`) REFERENCES `DeliveryService`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PillowOrderItem` ADD CONSTRAINT `PillowOrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `PillowOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PillowOrderItem` ADD CONSTRAINT `PillowOrderItem_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
