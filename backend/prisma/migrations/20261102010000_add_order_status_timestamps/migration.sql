-- Track when orders enter IN_PROCESS and DELIVERED
ALTER TABLE `Order` ADD COLUMN `inProcessAt` DATETIME(3) NULL;
ALTER TABLE `Order` ADD COLUMN `deliveredAt` DATETIME(3) NULL;

CREATE INDEX `Order_inProcessAt_idx` ON `Order`(`inProcessAt`);
CREATE INDEX `Order_deliveredAt_idx` ON `Order`(`deliveredAt`);
