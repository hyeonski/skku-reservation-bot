-- CreateTable
CREATE TABLE `client` (
    `id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation` (
    `id` CHAR(36) NOT NULL,
    `client_id` CHAR(36) NOT NULL,
    `status` ENUM('active', 'completed', 'abandoned_user', 'abandoned_timeout') NOT NULL DEFAULT 'active',
    `history` JSON NOT NULL,
    `last_intent` VARCHAR(40) NULL,
    `last_filled_slots` JSON NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `conversation_client_id_updated_at_idx`(`client_id`, `updated_at`),
    INDEX `conversation_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `space` (
    `id` CHAR(36) NOT NULL,
    `gls_space_code` VARCHAR(40) NOT NULL,
    `campus_code` VARCHAR(8) NOT NULL,
    `building_no` VARCHAR(16) NOT NULL,
    `campus_name` VARCHAR(40) NOT NULL,
    `building_name` VARCHAR(80) NOT NULL,
    `room_name` VARCHAR(120) NOT NULL,
    `capacity_min` INTEGER NOT NULL,
    `capacity_max` INTEGER NOT NULL,
    `use_jojik_code` VARCHAR(20) NULL,
    `use_jojik_name` VARCHAR(120) NULL,
    `admin_jojik_code` VARCHAR(20) NULL,
    `admin_jojik_name` VARCHAR(120) NULL,
    `contents` TEXT NULL,
    `limit_day_yn` BOOLEAN NOT NULL DEFAULT false,
    `limit_day` INTEGER NULL,
    `limit_time_yn` BOOLEAN NOT NULL DEFAULT false,
    `limit_time_hhmm` VARCHAR(4) NULL,
    `daeyeo_gb` VARCHAR(4) NULL,
    `scraped_at` DATETIME(3) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `space_gls_space_code_key`(`gls_space_code`),
    INDEX `space_capacity_min_capacity_max_idx`(`capacity_min`, `capacity_max`),
    INDEX `space_campus_code_building_no_idx`(`campus_code`, `building_no`),
    INDEX `space_use_jojik_code_idx`(`use_jojik_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversation` ADD CONSTRAINT `conversation_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
