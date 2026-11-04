"""Migration 0003 — add missing admin permission keys not present in 0002.

Revision ID: 0003_add_admin_permissions
Revises: 0002_align_schema
Create Date: 2026-02-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_add_admin_permissions"
down_revision: Union[str, None] = "0002_align_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new permission keys idempotently (ON CONFLICT DO NOTHING)
    op.execute("""
        INSERT INTO permissions (key, description) VALUES
            ('admin:users:read',      'List all users (admin)'),
            ('admin:users:write',     'Create/edit users (admin)'),
            ('complaints:own:read',   'Read own complaints (alias)'),
            ('complaints:own:create', 'Create own complaints (alias)')
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM permissions
        WHERE key IN (
            'admin:users:read',
            'admin:users:write',
            'complaints:own:read',
            'complaints:own:create'
        )
    """)
