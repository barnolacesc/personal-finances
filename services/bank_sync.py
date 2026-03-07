"""
Bank sync service.

sync_transactions() is called by APScheduler every 6 hours.
It fetches settled BBVA transactions via Enable Banking, deduplicates them,
maps merchants to categories, and inserts new Expense rows.
"""

import json
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


def sync_transactions():
    """Fetch new bank transactions and persist them as Expense rows."""
    # Import here to avoid circular imports at module load time
    from app import app, db, AppToken, SyncLog, Expense, MerchantMapping
    from services import enable_banking as eb

    with app.app_context():
        expenses_added = 0
        unclassified = 0
        try:
            # 1. Load token record
            token_record = AppToken.query.get("enable_banking")
            if not token_record:
                logger.warning("bank_sync: no AppToken for 'enable_banking', skipping")
                return

            token_data = json.loads(token_record.value)

            # 2. Determine sync window
            last_sync_raw = token_data.get("last_sync_at")
            if last_sync_raw:
                date_from = datetime.fromisoformat(last_sync_raw)
            else:
                date_from = datetime.now(timezone.utc) - timedelta(days=30)
            if date_from.tzinfo is None:
                date_from = date_from.replace(tzinfo=timezone.utc)

            account_id = __import__("os").environ.get("ENABLE_BANKING_ACCOUNT_ID", "")
            if not account_id:
                raise ValueError("ENABLE_BANKING_ACCOUNT_ID env var not set")

            # 4. Fetch transactions
            transactions = eb.get_transactions(account_id, date_from)

            # 5. Load merchant mappings (case-insensitive substring match)
            mappings = MerchantMapping.query.all()

            for txn in transactions:
                ext_id = txn.get("external_id")
                if not ext_id:
                    logger.warning(
                        f"bank_sync: transaction missing external_id, skipping: {txn}"
                    )
                    continue

                # Dedup
                if Expense.query.filter_by(external_id=ext_id).first():
                    continue

                # Map merchant → category
                category = "other"
                description = (
                    txn.get("merchant") or txn.get("description") or "Bank transaction"
                )
                merchant_upper = (txn.get("merchant") or "").upper()

                for mapping in mappings:
                    if mapping.pattern.upper() in merchant_upper:
                        category = mapping.category
                        description = mapping.description
                        break
                else:
                    unclassified += 1

                # Parse transaction date
                txn_date_raw = txn.get("date")
                try:
                    txn_date = datetime.fromisoformat(txn_date_raw).replace(
                        tzinfo=timezone.utc
                    )
                except (TypeError, ValueError):
                    txn_date = datetime.now(timezone.utc)

                expense = Expense(
                    amount=txn["amount"],
                    category=category,
                    description=description[:200],
                    date=txn_date,
                    source="bank_sync",
                    external_id=ext_id,
                    merchant=txn.get("merchant", "")[:200],
                )
                db.session.add(expense)
                expenses_added += 1

            # 6. Update last_sync_at
            token_data["last_sync_at"] = datetime.now(timezone.utc).isoformat()
            token_record.value = json.dumps(token_data)
            token_record.updated_at = datetime.now(timezone.utc)

            db.session.add(
                SyncLog(
                    status="ok",
                    expenses_added=expenses_added,
                    unclassified=unclassified,
                )
            )
            db.session.commit()
            logger.info(
                f"bank_sync: added {expenses_added} expenses "
                f"({unclassified} unclassified)"
            )

        except Exception as e:
            logger.error(f"bank_sync error: {e}", exc_info=True)
            db.session.rollback()
            try:
                with app.app_context():
                    db.session.add(SyncLog(status="error", error_message=str(e)))
                    db.session.commit()
            except Exception:
                pass
