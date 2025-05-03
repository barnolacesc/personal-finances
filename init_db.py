from app import db, app
import os

def init_database():
    # Get the database file path
    db_path = 'expenses.db'
    
    # Remove existing database if it exists
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            print(f"Removed existing database: {db_path}")
        except Exception as e:
            print(f"Error removing existing database: {e}")
            return False

    # Create the database
    try:
        with app.app_context():
            db.create_all()
            print(f"Successfully created database: {db_path}")
            
            # Set proper permissions
            os.chmod(db_path, 0o666)
            print("Set database permissions to 666")
            
        return True
    except Exception as e:
        print(f"Error creating database: {e}")
        return False

if __name__ == "__main__":
    success = init_database()
    if success:
        print("Database initialization completed successfully")
    else:
        print("Database initialization failed") 