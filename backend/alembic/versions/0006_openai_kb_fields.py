"""Alembic migration 0006 — add OpenAI Vector Store fields to documents table."""
from alembic import op
import sqlalchemy as sa


revision = "0006_openai_kb_fields"
down_revision = "0005_sla_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("openai_file_id", sa.String(200), nullable=True))
    op.add_column("documents", sa.Column("openai_status", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "openai_status")
    op.drop_column("documents", "openai_file_id")
