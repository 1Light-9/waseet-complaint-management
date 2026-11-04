"""Phase 1.5 — Replace old schema with correct internal IT/HR complaints system schema.

Revision ID: 0002_align_schema
Revises: 0001_baseline
Create Date: 2026-02-18

Changes from 0001:
- Drop all old tables (roles, users, complaints, audit_logs, kb_documents, kb_chunks)
- Create correct schema:
    departments, categories,
    permissions, roles, role_permissions, users,
    complaints, complaint_comments, complaint_attachments, complaint_history,
    sla_policies, sla_events,
    documents, document_chunks (with pgvector)
- Seed: departments (IT, HR), categories, roles (Requester/Agent/Manager/Admin), permissions
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_align_schema"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Ensure extensions ────────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # ── Drop old tables (from 0001_baseline) in dependency order ─────────────
    op.execute("DROP TABLE IF EXISTS kb_chunks CASCADE")
    op.execute("DROP TABLE IF EXISTS kb_documents CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS complaints CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS roles CASCADE")

    # ═══════════════════════════════════════════════════════════════════════
    # ORGANIZATION
    # ═══════════════════════════════════════════════════════════════════════

    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ═══════════════════════════════════════════════════════════════════════
    # RBAC
    # ═══════════════════════════════════════════════════════════════════════

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ═══════════════════════════════════════════════════════════════════════
    # COMPLAINTS
    # ═══════════════════════════════════════════════════════════════════════

    op.create_table(
        "complaints",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("requester_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(20), nullable=False, server_default="NEW"),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_complaints_status", "complaints", ["status"])
    op.create_index("ix_complaints_requester_id", "complaints", ["requester_id"])
    op.create_index("ix_complaints_department_id", "complaints", ["department_id"])

    op.create_table(
        "complaint_comments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("complaint_id", sa.Integer(), sa.ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_complaint_comments_complaint_id", "complaint_comments", ["complaint_id"])

    op.create_table(
        "complaint_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("complaint_id", sa.Integer(), sa.ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_complaint_attachments_complaint_id", "complaint_attachments", ["complaint_id"])

    op.create_table(
        "complaint_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("complaint_id", sa.Integer(), sa.ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("from_value", sa.Text(), nullable=True),
        sa.Column("to_value", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_complaint_history_complaint_id", "complaint_history", ["complaint_id"])

    # ═══════════════════════════════════════════════════════════════════════
    # SLA
    # ═══════════════════════════════════════════════════════════════════════

    op.create_table(
        "sla_policies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("response_hours", sa.Integer(), nullable=False),
        sa.Column("resolve_hours", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "sla_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("complaint_id", sa.Integer(), sa.ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meta_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_sla_events_complaint_id", "sla_events", ["complaint_id"])

    # ═══════════════════════════════════════════════════════════════════════
    # KNOWLEDGE BASE / AI DOCUMENTS
    # ═══════════════════════════════════════════════════════════════════════

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("filename", sa.String(500), nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("storage_path", sa.String(1000), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("uploaded_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])

    # Add pgvector column separately (pgvector type not natively in SQLAlchemy DDL)
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding_vector vector(1536)")
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding ON document_chunks "
        "USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)"
    )

    # ═══════════════════════════════════════════════════════════════════════
    # SEED DATA
    # ═══════════════════════════════════════════════════════════════════════

    # Departments
    op.execute("""
        INSERT INTO departments (name) VALUES
            ('IT'),
            ('HR')
    """)

    # Categories
    op.execute("""
        INSERT INTO categories (name, department_id) VALUES
            ('Network',        (SELECT id FROM departments WHERE name = 'IT')),
            ('Email',          (SELECT id FROM departments WHERE name = 'IT')),
            ('Account Access', (SELECT id FROM departments WHERE name = 'IT')),
            ('Payroll',        (SELECT id FROM departments WHERE name = 'HR')),
            ('Letters',        (SELECT id FROM departments WHERE name = 'HR')),
            ('Attendance',     (SELECT id FROM departments WHERE name = 'HR'))
    """)

    # Roles
    op.execute("""
        INSERT INTO roles (name, description) VALUES
            ('Requester', 'Employee who submits complaints'),
            ('Agent',     'Support agent who handles complaints'),
            ('Manager',   'Department manager who oversees and escalates'),
            ('Admin',     'System administrator with full access')
    """)

    # Permissions
    op.execute("""
        INSERT INTO permissions (key, description) VALUES
            ('complaints:create',       'Submit a new complaint'),
            ('complaints:read_own',     'View own complaints'),
            ('complaints:read_all',     'View all complaints'),
            ('complaints:update',       'Update complaint status/assignment'),
            ('complaints:close',        'Close a complaint'),
            ('comments:create',         'Add a comment'),
            ('comments:read_internal',  'Read internal (agent-only) comments'),
            ('users:manage',            'Create/edit/deactivate users'),
            ('roles:manage',            'Assign roles to users'),
            ('kb:upload',               'Upload knowledge base documents'),
            ('kb:delete',               'Delete knowledge base documents'),
            ('reports:view',            'View dashboard and reports'),
            ('sla:manage',              'Configure SLA policies')
    """)

    # Role → Permission assignments
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.name = 'Requester'
          AND p.key IN ('complaints:create', 'complaints:read_own', 'comments:create')
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.name = 'Agent'
          AND p.key IN (
              'complaints:read_all', 'complaints:update', 'complaints:close',
              'comments:create', 'comments:read_internal', 'reports:view'
          )
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.name = 'Manager'
          AND p.key IN (
              'complaints:read_all', 'complaints:update', 'complaints:close',
              'comments:create', 'comments:read_internal',
              'users:manage', 'kb:upload', 'kb:delete',
              'reports:view', 'sla:manage'
          )
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.name = 'Admin'
    """)

    # Default SLA policies (response_hours / resolve_hours) per department
    op.execute("""
        INSERT INTO sla_policies (department_id, category_id, priority, response_hours, resolve_hours)
        SELECT d.id, NULL, priority, response_h, resolve_h
        FROM departments d,
             (VALUES
                ('LOW',    8,  72),
                ('MEDIUM', 4,  48),
                ('HIGH',   2,  24),
                ('URGENT', 1,   8)
             ) AS t(priority, response_h, resolve_h)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_chunks CASCADE")
    op.execute("DROP TABLE IF EXISTS documents CASCADE")
    op.execute("DROP TABLE IF EXISTS sla_events CASCADE")
    op.execute("DROP TABLE IF EXISTS sla_policies CASCADE")
    op.execute("DROP TABLE IF EXISTS complaint_history CASCADE")
    op.execute("DROP TABLE IF EXISTS complaint_attachments CASCADE")
    op.execute("DROP TABLE IF EXISTS complaint_comments CASCADE")
    op.execute("DROP TABLE IF EXISTS complaints CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS role_permissions CASCADE")
    op.execute("DROP TABLE IF EXISTS permissions CASCADE")
    op.execute("DROP TABLE IF EXISTS roles CASCADE")
    op.execute("DROP TABLE IF EXISTS categories CASCADE")
    op.execute("DROP TABLE IF EXISTS departments CASCADE")
