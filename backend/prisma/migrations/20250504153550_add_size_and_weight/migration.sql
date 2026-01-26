/*
  Warnings:

  - Added the required column `size` to the `ProductVariant` table without a default value. This is not possible if the table is not empty.

*/
-- Add size column with default value
ALTER TABLE `ProductVariant` ADD COLUMN `size` VARCHAR(20) NOT NULL DEFAULT '120X20X15';

-- Keep weight column with default value
ALTER TABLE `ProductVariant` MODIFY COLUMN `weight` DECIMAL(10,2) NOT NULL DEFAULT 1.0;
