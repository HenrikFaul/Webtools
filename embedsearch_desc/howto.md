-- Optional helper: copy the global catalog inventory into one workspace
-- Usage:
--   SELECT public.import_enterprise_catalog_to_workspace('<workspace_uuid>'::uuid);
-- This creates workspace-level copies linked back to the catalog rows.
-- Safe to re-run: it upserts by the workspace-level unique constraints.

CREATE OR REPLACE FUNCTION public.import_enterprise_catalog_to_workspace(
  p_workspace_id uuid,
  p_approved boolean DEFAULT true
)
RETURNS TABLE (
  categories_imported integer,
  roles_imported integer,
  skills_imported integer,
  role_skill_links_imported integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categories integer := 0;
  v_roles integer := 0;
  v_skills integer := 0;
  v_links integer := 0;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'p_workspace_id cannot be NULL';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.enterprise_workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace % does not exist in public.enterprise_workspaces', p_workspace_id;
  END IF;


public.enterprise_workspace_role_categories


  INSERT INTO public.enterprise_workspace_role_categories
    (workspace_id, catalog_category_id, name, is_active)
  SELECT p_workspace_id, c.id, c.name, c.is_active
  FROM public.enterprise_catalog_categories c
  WHERE c.is_active = true
  ON CONFLICT (workspace_id, name) DO UPDATE
    SET catalog_category_id = EXCLUDED.catalog_category_id,
        is_active = EXCLUDED.is_active,
        updated_at = now();
  GET DIAGNOSTICS v_categories = ROW_COUNT;

  INSERT INTO public.enterprise_workspace_roles
    (workspace_id, category_id, catalog_role_id, name, is_active)
  SELECT
    p_workspace_id,
    wc.id,
    cr.id,
    cr.name,
    cr.is_active
  FROM public.enterprise_catalog_roles cr
  JOIN public.enterprise_catalog_categories cc ON cc.id = cr.category_id
  JOIN public.enterprise_workspace_role_categories wc
    ON wc.workspace_id = p_workspace_id
   AND wc.catalog_category_id = cc.id
  WHERE cr.is_active = true
    AND cc.is_active = true
  ON CONFLICT (workspace_id, category_id, name) DO UPDATE
    SET catalog_role_id = EXCLUDED.catalog_role_id,
        is_active = EXCLUDED.is_active,
        updated_at = now();
  GET DIAGNOSTICS v_roles = ROW_COUNT;

  INSERT INTO public.enterprise_workspace_skills
    (workspace_id, catalog_skill_id, name, is_active)
  SELECT p_workspace_id, cs.id, cs.name, cs.is_active
  FROM public.enterprise_catalog_skills cs
  WHERE cs.is_active = true
  ON CONFLICT (workspace_id, name) DO UPDATE
    SET catalog_skill_id = EXCLUDED.catalog_skill_id,
        is_active = EXCLUDED.is_active,
        updated_at = now();
  GET DIAGNOSTICS v_skills = ROW_COUNT;

  INSERT INTO public.enterprise_workspace_role_skills
    (workspace_id, role_id, workspace_skill_id, required, approved, min_experience_level)
  SELECT
    p_workspace_id,
    wr.id AS role_id,
    ws.id AS workspace_skill_id,
    crs.required,
    p_approved,
    crs.min_experience_level
  FROM public.enterprise_catalog_role_skills crs
  JOIN public.enterprise_catalog_roles cr ON cr.id = crs.role_id
  JOIN public.enterprise_catalog_skills cs ON cs.id = crs.skill_id
  JOIN public.enterprise_workspace_roles wr
    ON wr.workspace_id = p_workspace_id
   AND wr.catalog_role_id = cr.id
  JOIN public.enterprise_workspace_skills ws
    ON ws.workspace_id = p_workspace_id
   AND ws.catalog_skill_id = cs.id
  ON CONFLICT (role_id, workspace_skill_id) DO UPDATE
    SET required = EXCLUDED.required,
        approved = EXCLUDED.approved,
        min_experience_level = EXCLUDED.min_experience_level,
        updated_at = now();
  GET DIAGNOSTICS v_links = ROW_COUNT;

  RETURN QUERY SELECT v_categories, v_roles, v_skills, v_links;
END;
$$;
