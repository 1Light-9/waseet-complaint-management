"""0005 — add unique constraint on sla_events(complaint_id, event_type)."""
from alembic import op
import sqlalchemy as sa

revision = "0005_sla_unique"
down_revision = "0004_add_sla_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add unique constraint so the same event type is never duplicated per complaint.
    # ON CONFLICT DO NOTHING in the service layer makes this safe with concurrent writes.
    with op.batch_alter_table("sla_events") as batch_op:
        batch_op.create_unique_constraint(
            "uq_sla_events_complaint_event",
            ["complaint_id", "event_type"],
        )


def downgrade() -> None:
    with op.batch_alter_table("sla_events") as batch_op:
        batch_op.drop_constraint("uq_sla_events_complaint_event", type_="unique")
