-- 교내 공간 예약 에이전트 MySQL schema draft
-- 주의: 이 파일은 팀 공유/검토용입니다. 아직 서버에 실행하지 마세요.

CREATE DATABASE IF NOT EXISTS skku_reservation_agent
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE skku_reservation_agent;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  external_id VARCHAR(120) NULL,
  display_name VARCHAR(80) NULL,
  organizer VARCHAR(120) NULL,
  event_type VARCHAR(40) NOT NULL DEFAULT '회의',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_external_id (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spaces (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campus VARCHAR(80) NOT NULL,
  building VARCHAR(80) NOT NULL,
  room VARCHAR(40) NOT NULL,
  name VARCHAR(140) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  open_time TIME NOT NULL DEFAULT '09:00:00',
  close_time TIME NOT NULL DEFAULT '22:00:00',
  rejection_risk ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low',
  rejection_reason VARCHAR(255) NULL,
  tags JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_spaces_campus_building_room (campus, building, room),
  KEY idx_spaces_capacity (capacity),
  KEY idx_spaces_building (building),
  KEY idx_spaces_risk (rejection_risk),
  CONSTRAINT chk_spaces_capacity CHECK (capacity > 0),
  CONSTRAINT chk_spaces_hours CHECK (open_time < close_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE space_reservation_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  space_id BIGINT UNSIGNED NOT NULL,
  reserved_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('pending', 'reserved', 'approved', 'unavailable', 'cancelled', 'rejected') NOT NULL DEFAULT 'reserved',
  source ENUM('portal_scan', 'user_applied', 'reservation_result', 'admin_seed', 'manual') NOT NULL DEFAULT 'portal_scan',
  external_ref VARCHAR(160) NULL,
  note VARCHAR(255) NULL,
  fetched_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_space_slots_lookup (space_id, reserved_date, start_time, end_time),
  KEY idx_space_slots_status (status),
  KEY idx_space_slots_source_ref (source, external_ref),
  CONSTRAINT fk_space_slots_space
    FOREIGN KEY (space_id) REFERENCES spaces(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_space_slots_time CHECK (start_time < end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservation_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  raw_text TEXT NOT NULL,
  parsed_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  people INT UNSIGNED NULL,
  purpose VARCHAR(160) NULL,
  campus VARCHAR(80) NULL,
  building VARCHAR(80) NULL,
  room VARCHAR(40) NULL,
  parse_result JSON NOT NULL,
  status ENUM('parsed', 'recommended', 'applied', 'submitted', 'approved', 'rejected', 'failed') NOT NULL DEFAULT 'parsed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reservation_requests_user_created (user_id, created_at),
  KEY idx_reservation_requests_status (status),
  CONSTRAINT fk_reservation_requests_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_reservation_requests_people CHECK (people IS NULL OR people > 0),
  CONSTRAINT chk_reservation_requests_time CHECK (
    start_time IS NULL OR end_time IS NULL OR start_time < end_time
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservation_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  request_id BIGINT UNSIGNED NULL,
  space_id BIGINT UNSIGNED NULL,
  space_name VARCHAR(140) NOT NULL,
  reserved_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  people INT UNSIGNED NULL,
  status ENUM('applied', 'submitted', 'approved', 'rejected', 'cancelled', 'failed') NOT NULL DEFAULT 'applied',
  rejection_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reservation_history_user_created (user_id, created_at),
  KEY idx_reservation_history_space (space_id),
  CONSTRAINT fk_reservation_history_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_reservation_history_request
    FOREIGN KEY (request_id) REFERENCES reservation_requests(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_reservation_history_space
    FOREIGN KEY (space_id) REFERENCES spaces(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_reservation_history_people CHECK (people IS NULL OR people > 0),
  CONSTRAINT chk_reservation_history_time CHECK (
    start_time IS NULL OR end_time IS NULL OR start_time < end_time
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rejected_spaces (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  space_id BIGINT UNSIGNED NULL,
  campus VARCHAR(80) NOT NULL,
  building VARCHAR(80) NOT NULL,
  room VARCHAR(40) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  source ENUM('user_report', 'reservation_result', 'admin_seed') NOT NULL DEFAULT 'user_report',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rejected_spaces_lookup (campus, building, room),
  CONSTRAINT fk_rejected_spaces_space
    FOREIGN KEY (space_id) REFERENCES spaces(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recurring_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  title VARCHAR(120) NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  people INT UNSIGNED NOT NULL,
  purpose VARCHAR(160) NOT NULL,
  preferred_campus VARCHAR(80) NULL,
  preferred_building VARCHAR(80) NULL,
  preferred_room VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recurring_schedules_user_active (user_id, is_active),
  CONSTRAINT fk_recurring_schedules_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_recurring_schedules_day CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_recurring_schedules_people CHECK (people > 0),
  CONSTRAINT chk_recurring_schedules_time CHECK (start_time < end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feedback_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  request_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NULL,
  reason VARCHAR(120) NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feedback_events_created (created_at),
  CONSTRAINT fk_feedback_events_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_feedback_events_request
    FOREIGN KEY (request_id) REFERENCES reservation_requests(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_feedback_events_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
