-- TASK 8: optional fulfillment location on orders (nullable = LEGACY / UNKNOWN).
-- Additive only. Does not assign locations to existing rows. Does not touch stock.

ALTER TABLE `Order` ADD COLUMN `locationId` INTEGER NULL;
ALTER TABLE `PillowOrder` ADD COLUMN `locationId` INTEGER NULL;

CREATE INDEX `Order_locationId_idx` ON `Order`(`locationId`);
CREATE INDEX `PillowOrder_locationId_idx` ON `PillowOrder`(`locationId`);

ALTER TABLE `Order` ADD CONSTRAINT `Order_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PillowOrder` ADD CONSTRAINT `PillowOrder_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
