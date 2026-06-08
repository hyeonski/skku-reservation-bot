-- CreateTable
CREATE TABLE `reservation_record` (
    `id` CHAR(36) NOT NULL,
    `client_id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `weekday` INTEGER NOT NULL,
    `start_time` VARCHAR(5) NOT NULL,
    `end_time` VARCHAR(5) NOT NULL,
    `headcount` INTEGER NOT NULL,
    `organization` VARCHAR(191) NOT NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `purpose` TEXT NOT NULL,
    `hangsa_gb_code` VARCHAR(8) NOT NULL,
    `space_code` VARCHAR(40) NULL,
    `space_label` VARCHAR(191) NULL,
    `reserved_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `reservation_record_conversation_id_key`(`conversation_id`),
    INDEX `reservation_record_client_id_reserved_at_idx`(`client_id`, `reserved_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reservation_record` ADD CONSTRAINT `reservation_record_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
