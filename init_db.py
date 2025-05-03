from app import db, app
import os
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def init_database():
    # Get the absolute path for the database
    current_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(current_dir, 'expenses.db')
    
    logger.info(f"Database path: {db_path}")
    logger.info(f"Current working directory: {os.getcwd()}")
    
    # Remove existing database if it exists
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            logger.info(f"Removed existing database: {db_path}")
        except Exception as e:
            logger.error(f"Error removing existing database: {e}")
            return False

    # Create the database
    try:
        with app.app_context():
            db.create_all()
            logger.info(f"Successfully created database")
            
            # Verify database file exists
            if not os.path.exists(db_path):
                logger.error(f"Database file not found at expected path: {db_path}")
                return False
                
            # Set proper permissions
            try:
                os.chmod(db_path, 0o666)
                logger.info(f"Set database permissions to 666")
            except Exception as e:
                logger.error(f"Error setting database permissions: {e}")
                return False
            
            # Verify database is writable
            try:
                with open(db_path, 'ab') as f:
                    pass
                logger.info("Successfully verified database is writable")
            except Exception as e:
                logger.error(f"Database is not writable: {e}")
                return False
                
        return True
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        return False

if __name__ == "__main__":
    success = init_database()
    if success:
        logger.info("Database initialization completed successfully")
    else:
        logger.error("Database initialization failed") 