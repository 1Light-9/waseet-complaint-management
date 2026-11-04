"""Migration 0004 — add SLA deadline columns + escalation flag to complaints.

Revision ID: 0004_add_sla_columns
Revises: 0003_add_admin_permissions
Create Date: 2026-02-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_add_sla_columns"
down_revision: Union[str, None] = "0003_add_admin_permissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns idempotently
    conn = op.get_bind()
    cols = {
        row[0]
        for row in conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'complaints'"
            )
        )
    }

    if "response_due_at" not in cols:
        op.add_column(
            "complaints",
            sa.Column("response_due_at", sa.DateTime(timezone=True), nullable=True),
        )

    if "resolve_due_at" not in cols:
        op.add_column(
            "complaints",
            sa.Column("resolve_due_at", sa.DateTime(timezone=True), nullable=True),
        )

    if "escalated_to_manager" not in cols:
        op.add_column(
            "complaints",
            sa.Column(
                "escalated_to_manager",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    if "csat_rating" not in cols:
        op.add_column(
            "complaints",
            sa.Column("csat_rating", sa.Integer(), nullable=True),
        )

    if "csat_feedback" not in cols:
        op.add_column(
            "complaints",
            sa.Column("csat_feedback", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("complaints", "csat_feedback")
    op.drop_column("complaints", "csat_rating")
    op.drop_column("complaints", "escalated_to_manager")
    op.drop_column("complaints", "resolve_due_at")
    op.drop_column("complaints", "response_due_at")
