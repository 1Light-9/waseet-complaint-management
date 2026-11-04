"""Status transition enforcement for complaints."""
from fastapi import HTTPException, status

from app.models.complaint import ComplaintStatus

# Allowed transitions: {from_status: [allowed_to_statuses]}
ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    ComplaintStatus.NEW: [ComplaintStatus.IN_PROGRESS],
    ComplaintStatus.IN_PROGRESS: [ComplaintStatus.WAITING_USER, ComplaintStatus.RESOLVED],
    ComplaintStatus.WAITING_USER: [ComplaintStatus.IN_PROGRESS],
    ComplaintStatus.RESOLVED: [ComplaintStatus.CLOSED, ComplaintStatus.IN_PROGRESS],
    ComplaintStatus.CLOSED: [],
}


def validate_transition(from_status: str, to_status: str) -> None:
    """Raise HTTP 400 if the transition is not allowed."""
    allowed = ALLOWED_TRANSITIONS.get(from_status, [])
    if to_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status transition: {from_status} → {to_status}. "
                f"Allowed from {from_status}: {allowed or 'none'}"
            ),
        )
