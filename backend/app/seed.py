"""Idempotent seed script — safe to run multiple times.

Run inside the container:
    python -m app.seed
or via Docker:
    docker compose exec backend python -m app.seed
"""
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.organization import Category, Department
from app.models.sla import SLAPolicy
from app.models.user import Permission, Role, RolePermission, User
from app.models.complaint import Complaint, ComplaintStatus, ComplaintPriority, ComplaintComment

log = logging.getLogger(__name__)

# ── Seed data ─────────────────────────────────────────────────────────────────

DEPARTMENTS = ["IT", "HR"]

CATEGORIES = {
    "IT": ["Network", "Email", "Account Access"],
    "HR": ["Payroll", "Letters", "Attendance"],
}

ROLES = {
    "Requester": "Employee who submits complaints",
    "Agent": "Support agent who handles complaints",
    "Manager": "Department manager who oversees and escalates",
    "Admin": "System administrator with full access",
}

PERMISSIONS = {
    "complaints:create": "Submit a new complaint",
    "complaints:read_own": "View own complaints",
    "complaints:read_all": "View all complaints",
    "complaints:update": "Update complaint status/assignment",
    "complaints:close": "Close a complaint",
    "comments:create": "Add a comment",
    "comments:read_internal": "Read internal (agent-only) comments",
    "users:manage": "Create/edit/deactivate users",
    "roles:manage": "Assign roles to users",
    "kb:upload": "Upload knowledge base documents",
    "kb:delete": "Delete knowledge base documents",
    "reports:view": "View dashboard and reports",
    "sla:manage": "Configure SLA policies",
    # Admin-specific
    "admin:users:read": "List all users (admin)",
    "admin:users:write": "Create/edit users (admin)",
    # Future complaint permissions
    "complaints:own:read": "Read own complaints (alias)",
    "complaints:own:create": "Create own complaints (alias)",
}

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "Requester": [
        "complaints:create", "complaints:read_own", "complaints:own:read",
        "complaints:own:create", "comments:create",
    ],
    "Agent": [
        "complaints:read_all", "complaints:update", "complaints:close",
        "comments:create", "comments:read_internal", "reports:view",
    ],
    "Manager": [
        "complaints:read_all", "complaints:update", "complaints:close",
        "comments:create", "comments:read_internal",
        "users:manage", "kb:upload", "kb:delete",
        "reports:view", "sla:manage",
        "admin:users:read",
    ],
    "Admin": list(PERMISSIONS.keys()),  # All permissions
}

DEMO_PASSWORD = "DemoPass123!"

DEMO_USERS = [
    {"email": "admin@demo.com",        "full_name": "System Admin",    "role": "Admin",     "department": None},
    {"email": "it.manager@demo.com",   "full_name": "IT Manager",      "role": "Manager",   "department": "IT"},
    {"email": "it.agent@demo.com",     "full_name": "IT Agent",        "role": "Agent",     "department": "IT"},
    {"email": "requester@demo.com",    "full_name": "Demo Requester",  "role": "Requester", "department": "IT"},
]

# ── SLA Policies ──────────────────────────────────────────────────────────────
# Each entry: (dept_name, category_name_or_None, priority, response_hours, resolve_hours)
# category_name=None means department-level fallback.
#
# "Account Access" / URGENT uses tiny windows (0.017h ≈ 1 min, 0.05h ≈ 3 min)
# so near-breach and breach can be triggered quickly during live demos.

SLA_POLICIES: list[tuple] = [
    # IT dept — Network
    ("IT", "Network", "URGENT", 1,  4),
    ("IT", "Network", "HIGH",   2,  8),
    ("IT", "Network", "MEDIUM", 4,  24),
    ("IT", "Network", "LOW",    8,  48),
    # IT dept — Email
    ("IT", "Email",   "URGENT", 1,  4),
    ("IT", "Email",   "HIGH",   2,  8),
    ("IT", "Email",   "MEDIUM", 4,  24),
    ("IT", "Email",   "LOW",    8,  48),
    # IT dept — Account Access (DEMO FAST: 1 min response, 3 min resolve for URGENT)
    ("IT", "Account Access", "URGENT", 0.017, 0.05),
    ("IT", "Account Access", "HIGH",   1,     4),
    ("IT", "Account Access", "MEDIUM", 4,     24),
    ("IT", "Account Access", "LOW",    8,     48),
    # IT dept — fallback (no category)
    ("IT", None, "URGENT", 1,  4),
    ("IT", None, "HIGH",   2,  8),
    ("IT", None, "MEDIUM", 4,  24),
    ("IT", None, "LOW",    8,  48),
    # HR dept — fallback
    ("HR", None, "URGENT", 2,  8),
    ("HR", None, "HIGH",   4,  16),
    ("HR", None, "MEDIUM", 8,  48),
    ("HR", None, "LOW",    16, 96),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create(db: AsyncSession, model, filter_kwargs: dict, create_kwargs: dict | None = None):
    result = await db.execute(select(model).filter_by(**filter_kwargs))
    obj = result.scalar_one_or_none()
    if obj is None:
        obj = model(**(create_kwargs or filter_kwargs))
        db.add(obj)
        await db.flush()
        log.info("Created %s: %s", model.__name__, filter_kwargs)
    return obj


async def _seed_sla_policies(db: AsyncSession, dept_map: dict) -> None:
    """Seed SLA policies — idempotent (upsert by dept+cat+priority)."""
    from sqlalchemy import select as _sel
    from app.models.organization import Category

    for dept_name, cat_name, priority, resp_h, res_h in SLA_POLICIES:
        dept = dept_map.get(dept_name)
        if not dept:
            continue

        # Resolve category id
        cat_id: int | None = None
        if cat_name:
            r = await db.execute(_sel(Category).where(
                Category.name == cat_name,
                Category.department_id == dept.id,
            ))
            cat = r.scalar_one_or_none()
            cat_id = cat.id if cat else None

        # Check existence
        r2 = await db.execute(
            _sel(SLAPolicy).where(
                SLAPolicy.department_id == dept.id,
                SLAPolicy.category_id == cat_id,
                SLAPolicy.priority == priority,
            )
        )
        existing = r2.scalar_one_or_none()
        if existing:
            existing.response_hours = resp_h
            existing.resolve_hours = res_h
        else:
            db.add(SLAPolicy(
                department_id=dept.id,
                category_id=cat_id,
                priority=priority,
                response_hours=resp_h,
                resolve_hours=res_h,
            ))
            log.info("Created SLAPolicy: %s/%s/%s → %sh/%sh", dept_name, cat_name, priority, resp_h, res_h)


async def _seed_demo_complaints(db: AsyncSession, dept_map: dict[str, Department]) -> None:
    """Generate 30 demo complaints to populate the dashboard."""
    from sqlalchemy import select as _sel, delete as _del
    from datetime import datetime, timedelta, timezone
    import random
    import os
    
    # Check if complaints already exist
    r = await db.execute(_sel(Complaint).limit(1))
    if r.scalar_one_or_none() is not None:
        if os.getenv("RESET_DEMO") == "1":
            log.info("Resetting demo complaints...")
            await db.execute(_del(ComplaintComment))
            await db.execute(_del(Complaint))
            await db.flush()
        else:
            log.info("Complaints already exist. Set RESET_DEMO=1 to wipe and re-seed.")
            return
        
    # Get demo users
    users_r = await db.execute(_sel(User).where(User.email.in_([
        "it.agent@demo.com", "requester@demo.com"
    ])))
    users = {u.email: u for u in users_r.scalars().all()}
    requester = users.get("requester@demo.com")
    agent = users.get("it.agent@demo.com")
    
    if not requester or not agent:
        return
        
    # Get categories mapped by dept name
    cats_by_dept = {}
    for d_name, d_obj in dept_map.items():
        cr = await db.execute(_sel(Category).where(Category.department_id == d_obj.id))
        cats_by_dept[d_name] = cr.scalars().all()
        
    now = datetime.now(timezone.utc)
    
    priorities = list(ComplaintPriority)
    statuses = list(ComplaintStatus)
    
    subjects = [
        "Cannot access email", "Payroll issue", "Network is down", 
        "Need a new laptop", "Software license expired", "Salary deduction query",
        "VPN not connecting", "Printer out of ink", "Request for training",
        "Office chair broken", "Login page is slow", "Forgot password",
        "Need access to shared drive", "Attendance mismatch", "Holiday request issue",
        "Screen flickering", "Keyboard missing keys", "Update personal details",
        "Phone line dead", "Need external monitor", "Update bank details",
        "Air conditioning is weak", "Company car request", "Expense report rejected",
        "Lost ID card", "Coffee machine broken", "Maternity leave policy query",
        "Building access denied", "New project software needed", "Desktop freezing"
    ]
    
    for i in range(30):
        dept_name = random.choice(["IT", "HR"])
        dept = dept_map[dept_name]
        cat = random.choice(cats_by_dept[dept_name])
        
        status = random.choice(statuses)
        priority = random.choice(priorities)
        
        # Adjust timestamps nicely
        created_at = now - timedelta(days=random.randint(1, 14), hours=random.randint(1, 23))
        
        c = Complaint(
            subject=f"Demo {i+1}: {subjects[i % len(subjects)]}",
            description=f"This is a demo complaint description for {subjects[i % len(subjects)]}.\n\nPlease look into it.",
            department_id=dept.id,
            category_id=cat.id,
            requester_id=requester.id,
            assignee_id=agent.id if status != ComplaintStatus.NEW else None,
            priority=priority,
            status=status,
            created_at=created_at
        )
        db.add(c)
        await db.flush() # get ID
        
        # Add a dummy comment
        if status != ComplaintStatus.NEW:
            comment_at = created_at + timedelta(hours=1)
            comment = ComplaintComment(
                complaint_id=c.id,
                author_id=agent.id,
                is_internal=False,
                content="Looking into this issue right now.",
                created_at=comment_at
            )
            db.add(comment)
            c.first_response_at = comment_at
            
        if status in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED):
            c.resolved_at = created_at + timedelta(days=1)
            if status == ComplaintStatus.CLOSED:
                c.closed_at = c.resolved_at + timedelta(days=1)
                
    log.info("✅ Seeded 30 demo complaints.")

# ── Main seed ─────────────────────────────────────────────────────────────────

async def seed():
    async with AsyncSessionLocal() as db:
        # 1. Departments
        dept_map: dict[str, Department] = {}
        for name in DEPARTMENTS:
            dept = await _get_or_create(db, Department, {"name": name})
            dept_map[name] = dept

        # 2. Categories
        for dept_name, cats in CATEGORIES.items():
            dept = dept_map[dept_name]
            for cat_name in cats:
                await _get_or_create(
                    db, Category,
                    {"name": cat_name, "department_id": dept.id},
                )

        # 3. Permissions
        perm_map: dict[str, Permission] = {}
        for key, desc in PERMISSIONS.items():
            perm = await _get_or_create(
                db, Permission, {"key": key},
                {"key": key, "description": desc},
            )
            perm_map[key] = perm

        # 4. Roles
        role_map: dict[str, Role] = {}
        for role_name, desc in ROLES.items():
            role = await _get_or_create(
                db, Role, {"name": role_name},
                {"name": role_name, "description": desc},
            )
            role_map[role_name] = role

        # 5. Role → Permission assignments
        for role_name, perm_keys in ROLE_PERMISSIONS.items():
            role = role_map[role_name]
            for key in perm_keys:
                perm = perm_map.get(key)
                if not perm:
                    continue
                existing = await db.execute(
                    select(RolePermission).filter_by(
                        role_id=role.id, permission_id=perm.id
                    )
                )
                if existing.scalar_one_or_none() is None:
                    db.add(RolePermission(role_id=role.id, permission_id=perm.id))

        # 6. Demo users
        pw_hash = hash_password(DEMO_PASSWORD)
        for u in DEMO_USERS:
            existing = await db.execute(select(User).where(User.email == u["email"]))
            if existing.scalar_one_or_none() is not None:
                continue
            dept = dept_map.get(u["department"]) if u["department"] else None
            role = role_map[u["role"]]
            db.add(User(
                email=u["email"],
                password_hash=pw_hash,
                full_name=u["full_name"],
                role_id=role.id,
                department_id=dept.id if dept else None,
                is_active=True,
            ))
            log.info("Created user: %s (%s)", u["email"], u["role"])

        await db.commit()
        log.info("✅ Seed complete.")

        # 7. SLA policies
        await _seed_sla_policies(db, dept_map)
        await db.commit()
        log.info("✅ SLA policies seeded.")

        # 8. Demo Complaints
        await _seed_demo_complaints(db, dept_map)
        await db.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())
