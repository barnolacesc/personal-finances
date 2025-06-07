# Personal Finances Test Suite

This directory contains the test suite for the Personal Finances application. The tests are designed to ensure the reliability and correctness of the application's core functionality.

## Test Structure

The test suite is organized into several files:

- `conftest.py`: Contains shared fixtures and test configuration
- `test_api.py`: Tests for API endpoints
- `test_models.py`: Tests for database models
- `test_data_aggregation.py`: Tests for data aggregation and pagination

## Test Database

The tests use an isolated SQLite database to prevent affecting the development database. The test database is:
- Created in a temporary directory
- Fresh for each test session
- Dropped after tests complete

## Running Tests

To run the tests:

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_api.py

# Run specific test
pytest tests/test_api.py::test_add_expense
```

## Test Coverage

The test suite covers:

1. **API Endpoints**
   - Adding expenses
   - Getting expenses (with pagination)
   - Updating expenses
   - Deleting expenses
   - Getting available months
   - Static file serving

2. **Database Models**
   - Expense creation
   - Data persistence
   - Model validation
   - Data serialization

3. **Data Aggregation**
   - Pagination
   - Empty month handling

## Important Considerations

1. **Database Isolation**
   - Tests use a separate test database
   - Database is cleaned between tests
   - No tests affect the development database

2. **Test Data**
   - Test data is created using fixtures
   - Each test starts with a clean database
   - Test data is isolated between tests

3. **API Testing**
   - Tests verify both successful and error cases
   - Input validation is tested
   - Response formats are verified

4. **Model Testing**
   - Tests verify data integrity
   - Validation rules are tested
   - Relationships are verified

## Adding New Tests

When adding new tests:

1. Use existing fixtures when possible
2. Create new fixtures in `conftest.py` if needed
3. Ensure tests are isolated and don't affect other tests
4. Test both success and failure cases
5. Verify data integrity

## Common Issues

1. **Database State**
   - If tests fail due to database state, check the `clean_db` fixture
   - Ensure tests don't depend on specific database IDs

2. **Date/Time Handling**
   - Tests use UTC for consistency
   - Be aware of timezone differences when testing date-based features

3. **API Changes**
   - When modifying API endpoints, update corresponding tests
   - Ensure backward compatibility or update all affected tests

## Best Practices

1. **Test Independence**
   - Each test should be independent
   - Don't rely on the state from other tests
   - Use fixtures for test data

2. **Test Clarity**
   - Use descriptive test names
   - Add comments for complex test logic
   - Keep tests focused and simple

3. **Error Handling**
   - Test both success and error cases
   - Verify error messages and status codes
   - Test edge cases and invalid inputs

4. **Performance**
   - Keep tests fast and efficient
   - Use appropriate test scopes
   - Clean up resources after tests

## Contributing

When contributing to the test suite:

1. Follow the existing test patterns
2. Add tests for new features
3. Update tests when modifying existing features
4. Ensure all tests pass before submitting changes
5. Add appropriate documentation
