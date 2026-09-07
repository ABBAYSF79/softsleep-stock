-- CreateTable
CREATE TABLE `InventoryBalance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pillowId` INTEGER NOT NULL,
    `locationId` INTEGER NOT NULL,
    `physical` INTEGER NOT NULL DEFAULT 0,
    `presentation` INTEGER NOT NULL DEFAULT 0,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InventoryBalance_pillowId_idx`(`pillowId`),
    INDEX `InventoryBalance_locationId_idx`(`locationId`),
    INDEX `InventoryBalance_locationId_pillowId_idx`(`locationId`, `pillowId`),
    UNIQUE INDEX `InventoryBalance_pillowId_locationId_key`(`pillowId`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InventoryBalance` ADD CONSTRAINT `InventoryBalance_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryBalance` ADD CONSTRAINT `InventoryBalance_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
