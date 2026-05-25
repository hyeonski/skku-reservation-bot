-- AlterTable
ALTER TABLE `conversation`
  ADD COLUMN `confirmed_space_code` VARCHAR(40) NULL,
  ADD COLUMN `confirmed_space_label` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `reminder` (
    `id` CHAR(36) NOT NULL,
    `client_id` CHAR(36) NOT NULL,
    `status` ENUM('active', 'dismissed', 'accepted') NOT NULL DEFAULT 'active',
    `pattern_key` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `pattern` VARCHAR(255) NOT NULL,
    `proposed_date` VARCHAR(10) NOT NULL,
    `start_time` VARCHAR(5) NOT NULL,
    `end_time` VARCHAR(5) NOT NULL,
    `headcount` INTEGER NOT NULL,
    `organization` VARCHAR(191) NOT NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `space_label` VARCHAR(191) NULL,
    `prompt` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `dismissed_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,

    UNIQUE INDEX `reminder_client_id_pattern_key_proposed_date_key`(`client_id`, `pattern_key`, `proposed_date`),
    INDEX `reminder_client_id_status_proposed_date_idx`(`client_id`, `status`, `proposed_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reminder` ADD CONSTRAINT `reminder_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
