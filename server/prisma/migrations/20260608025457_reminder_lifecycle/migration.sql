-- AlterTable
ALTER TABLE `reminder` ADD COLUMN `expired_at` DATETIME(3) NULL,
    MODIFY `status` ENUM('active', 'dismissed', 'accepted', 'expired') NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE `pattern_mute` (
    `id` CHAR(36) NOT NULL,
    `client_id` CHAR(36) NOT NULL,
    `pattern_key` VARCHAR(191) NOT NULL,
    `muted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cleared_at` DATETIME(3) NULL,

    INDEX `pattern_mute_client_id_pattern_key_cleared_at_idx`(`client_id`, `pattern_key`, `cleared_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pattern_mute` ADD CONSTRAINT `pattern_mute_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
