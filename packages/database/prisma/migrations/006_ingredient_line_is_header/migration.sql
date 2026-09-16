-- D-1 remediation: recipe title/header lines are MARKED, not soft-deleted, so
-- they stay visible and reversible in parse review while never entering the
-- corrected object (D-12C). Header rows remain active (deleted_at NULL) and
-- share the line_no space with ingredient lines; every ingredient consumer
-- (listDraftLines, shopping, print, search, cook swaps) filters is_header = false.
ALTER TABLE recipe_ingredient_line ADD COLUMN is_header BOOLEAN NOT NULL DEFAULT false;
