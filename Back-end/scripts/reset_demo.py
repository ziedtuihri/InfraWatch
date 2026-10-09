#!/usr/bin/env python3
"""
scripts/reset_demo.py
---------------------
Wipe ALL InfraWatch data and keep only the superadmin account(s),
so the platform can be demoed end-to-end from a clean state:
account creation, role upgrades, Morpheus connection, wizard, deployment,
thresholds, alerts, audit log - everything starts empty.

Usage (from AlienDataCenter/, with the venv active):

    python scripts/reset_demo.py --yes                 # keep all superadmins
    python scripts/reset_demo.py --yes --keep admin    # keep ONLY user 'admin'
    python scripts/reset_demo.py                       # dry run: shows the plan

What it does:
  * TRUNCATE ... RESTART IDENTITY CASCADE on every data table
    (sessions, morpheus_config, tool configs, thresholds, alerts,
     notifications, task runs)
  * DELETE every user except the kept superadmin(s)
  * Leaves the kept user's password untouched

Note on browsers: stale wizard data in localStorage is handled by the app
itself - on the next login the frontend sees the DB has no sessions,
clears its local cache, and routes to the setup wizard.
"""
import argparse
import asyncio
import os
import sys

# import the app's settings regardless of where the script is launched from
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)            # AlienDataCenter/
sys.path.insert(0, ROOT)

import psycopg
from config import settings  # noqa: E402

# every table except `users` - order does not matter with CASCADE
DATA_TABLES = [
    "user_sessions",
    "morpheus_config",
    "resource_tool_configs",
    "threshold_configs",
    "alert_log",
    "task_runs",
    "notification_log",
    "notification_subscriptions",
]


async def main() -> int:
    ap = argparse.ArgumentParser(description="Reset InfraWatch to a clean demo state.")
    ap.add_argument("--yes", action="store_true",
                    help="actually perform the reset (otherwise dry run)")
    ap.add_argument("--keep", metavar="USERNAME", default=None,
                    help="keep ONLY this username (must be a superadmin); "
                         "default keeps every superadmin")
    args = ap.parse_args()

    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            # which of the data tables actually exist in this database
            await cur.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            existing = {r[0] for r in await cur.fetchall()}
            to_truncate = [t for t in DATA_TABLES if t in existing]

            # who will be kept
            if args.keep:
                await cur.execute(
                    "SELECT id, username, role FROM users WHERE username = %s",
                    (args.keep,))
                keep_rows = await cur.fetchall()
                if not keep_rows:
                    print(f"ERROR: user '{args.keep}' not found - aborting, nothing changed.")
                    return 1
                if keep_rows[0][2] != "superadmin":
                    print(f"ERROR: user '{args.keep}' has role '{keep_rows[0][2]}', "
                          f"not 'superadmin' - aborting, nothing changed.")
                    return 1
            else:
                await cur.execute(
                    "SELECT id, username, role FROM users WHERE role = 'superadmin'")
                keep_rows = await cur.fetchall()
                if not keep_rows:
                    print("ERROR: no superadmin exists - aborting so you don't lock "
                          "yourself out. Create one first or pass --keep.")
                    return 1

            await cur.execute("SELECT count(*) FROM users")
            total_users = (await cur.fetchone())[0]

            print("Plan:")
            print(f"  truncate tables : {', '.join(to_truncate) or '(none found)'}")
            print(f"  delete users    : {total_users - len(keep_rows)} of {total_users}")
            print(f"  keep            : " +
                  ", ".join(f"{u} (id={i}, {r})" for i, u, r in keep_rows))

            if not args.yes:
                print("\nDry run only - rerun with --yes to apply.")
                return 0

            # wipe data tables (resets SERIAL counters too)
            if to_truncate:
                await cur.execute(
                    "TRUNCATE " + ", ".join(to_truncate) + " RESTART IDENTITY CASCADE")

            # delete every other user
            keep_ids = tuple(i for i, _, _ in keep_rows)
            await cur.execute(
                "DELETE FROM users WHERE id <> ALL(%s)", (list(keep_ids),))
            deleted = cur.rowcount

        await conn.commit()

    print(f"\nDone. Deleted {deleted} user(s); all data tables emptied.")
    print("Next login will start from a clean wizard (step 1 for the superadmin).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
