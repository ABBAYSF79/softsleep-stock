-- CreateTable
CREATE TABLE `OrderPillowItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `pillowId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,

    INDEX `OrderPillowItem_orderId_idx`(`orderId`),
    INDEX `OrderPillowItem_pillowId_idx`(`pillowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderPillowItem` ADD CONSTRAINT `OrderPillowItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderPillowItem` ADD CONSTRAINT `OrderPillowItem_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
