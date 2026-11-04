-- Add REPORTED (postponed by customer) to OrderStatus. Appending an ENUM value keeps existing rows unchanged.
ALTER TABLE `Order` MODIFY `status` ENUM('PENDING', 'IN_PROCESS', 'DELIVERED', 'RETURNED', 'REPORTED') NOT NULL DEFAULT 'PENDING';

ALTER TABLE `PillowOrder` MODIFY `status` ENUM('PENDING', 'IN_PROCESS', 'DELIVERED', 'RETURNED', 'REPORTED') NOT NULL DEFAULT 'PENDING';
