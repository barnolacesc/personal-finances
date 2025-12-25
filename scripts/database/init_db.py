from app import db, app
import os
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def init_database():
    # Get the database path from Flask's instance folder
    db_path = os.path.join(app.instance_path, "expenses.db")

    logger.info(f"Database path: {db_path}")
    logger.info(f"Current working directory: {os.getcwd()}")
    logger.info(f"Flask instance path: {app.instance_path}")

    # Remove existing database if it exists
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            logger.info(f"Removed existing database: {db_path}")
        except Exception as e:
            logger.error(f"Error removing existing database: {e}")
            return False

    # Ensure instance folder exists
    os.makedirs(app.instance_path, exist_ok=True)
    logger.info(f"Ensured instance directory exists: {app.instance_path}")

    # Create the database
    try:
        with app.app_context():
            db.create_all()
            logger.info("Successfully created database")

            # Wait a short moment to ensure the file system has processed the creation
            time.sleep(0.1)

            # Verify database file exists
            if not os.path.exists(db_path):
                logger.error(f"Database file not found at expected path: {db_path}")
                # Try to list directory contents to debug
                dir_contents = os.listdir(app.instance_path)
                logger.info(f"Instance directory contents: {dir_contents}")
                parent_contents = os.listdir(os.path.dirname(app.instance_path))
                logger.info(f"Parent directory contents: {parent_contents}")
                return False

            # Set proper permissions
            try:
                os.chmod(db_path, 0o666)
                logger.info("Set database permissions to 666")
            except Exception as e:
                logger.error(f"Error setting database permissions: {e}")
                return False

            # Verify database is writable
            try:
                with open(db_path, "ab"):
                    pass
                logger.info("Successfully verified database is writable")
            except Exception as e:
                logger.error(f"Database is not writable: {e}")
                return False

        return True
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        # Try to list directory contents to debug
        try:
            dir_contents = os.listdir(app.instance_path)
            logger.info(f"Instance directory contents after error: {dir_contents}")
        except Exception as list_err:
            logger.error(f"Error listing directory: {list_err}")
        return False


if __name__ == "__main__":
    success = init_database()
    if success:
        logger.info("Database initialization completed successfully")
    else:
        logger.error("Database initialization failed")
