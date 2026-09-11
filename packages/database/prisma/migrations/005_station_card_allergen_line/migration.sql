-- D-23 (P5-2) + Q2 Option A: the station-card print snapshot carries the
-- frozen View-8 allergen line, persisted at analysis time by the worker.
-- Print/PDF must never re-derive it from the current effective-dated mapping
-- (ADR §7 amendment 2026-09-11; SCAFFOLD §7 Q2 RESOLVED).
ALTER TABLE analysis_station_card ADD COLUMN allergen_line VARCHAR(512);
