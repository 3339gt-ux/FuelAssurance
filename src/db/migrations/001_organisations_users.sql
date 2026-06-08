-- ============================================================================
-- Migration 001: Organisations, Users & Memberships
-- Description: Core multi-tenant foundation with Supabase auth integration
-- ============================================================================

-- =========================
-- EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- TABLE: organisations
-- =========================
CREATE TABLE organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_organisations_slug UNIQUE (slug),
    CONSTRAINT chk_organisations_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$')
);

COMMENT ON TABLE  organisations             IS 'Top-level tenant. Every operational record is scoped to an organisation.';
COMMENT ON COLUMN organisations.id          IS 'Primary key (UUID v4).';
COMMENT ON COLUMN organisations.name        IS 'Human-readable organisation name.';
COMMENT ON COLUMN organisations.slug        IS 'URL-safe unique identifier, lowercase alphanumeric with hyphens.';
COMMENT ON COLUMN organisations.created_at  IS 'Row creation timestamp (UTC).';
COMMENT ON COLUMN organisations.updated_at  IS 'Last modification timestamp (UTC).';

CREATE INDEX idx_organisations_slug ON organisations (slug);

-- =========================
-- TABLE: users
-- =========================
CREATE TABLE users (
    id          UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE  users             IS 'Application-level user profile, linked 1-to-1 with Supabase auth.users.';
COMMENT ON COLUMN users.id          IS 'Mirrors auth.users.id — set on signup via trigger or client.';
COMMENT ON COLUMN users.email       IS 'User email address (unique, validated format).';
COMMENT ON COLUMN users.full_name   IS 'Display name.';
COMMENT ON COLUMN users.avatar_url  IS 'URL to avatar image (storage bucket or external).';
COMMENT ON COLUMN users.created_at  IS 'Row creation timestamp (UTC).';
COMMENT ON COLUMN users.updated_at  IS 'Last modification timestamp (UTC).';

CREATE INDEX idx_users_email ON users (email);

-- =========================
-- TABLE: memberships
-- =========================
CREATE TABLE memberships (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_memberships_org_user UNIQUE (org_id, user_id),
    CONSTRAINT chk_memberships_role CHECK (role IN ('owner', 'admin', 'analyst', 'viewer'))
);

COMMENT ON TABLE  memberships             IS 'Links users to organisations with a specific role. A user may belong to multiple organisations.';
COMMENT ON COLUMN memberships.id          IS 'Primary key (UUID v4).';
COMMENT ON COLUMN memberships.org_id      IS 'FK → organisations. The tenant this membership belongs to.';
COMMENT ON COLUMN memberships.user_id     IS 'FK → users. The user granted access.';
COMMENT ON COLUMN memberships.role        IS 'Role within the organisation: owner, admin, analyst, or viewer.';
COMMENT ON COLUMN memberships.created_at  IS 'Row creation timestamp (UTC).';

CREATE INDEX idx_memberships_org_id  ON memberships (org_id);
CREATE INDEX idx_memberships_user_id ON memberships (user_id);

-- =========================
-- HELPER FUNCTION: get_user_org_ids()
-- Returns all org_ids the currently authenticated user belongs to.
-- Used extensively in RLS policies.
-- =========================
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT org_id
    FROM memberships
    WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_user_org_ids() IS 'Returns the set of organisation IDs the current Supabase auth user is a member of. Used by RLS policies.';

-- =========================
-- HELPER FUNCTION: get_user_role(org_id)
-- Returns the role of the current user in the given organisation.
-- =========================
CREATE OR REPLACE FUNCTION public.get_user_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM memberships
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_role(UUID) IS 'Returns the role of the current authenticated user within a specific organisation.';

-- =========================
-- TRIGGER: auto-update updated_at
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS 'Generic trigger function that stamps updated_at on every UPDATE.';

CREATE TRIGGER trg_organisations_updated_at
    BEFORE UPDATE ON organisations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
