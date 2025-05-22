# Personal Finance App - Modular Architecture

## 🏗️ **Architecture Overview**

This expense tracking application has been refactored into a modular, maintainable architecture. The codebase is now organized into logical layers with clear separation of concerns.

## 📁 **Directory Structure**

```
static/
├── components/           # Modular web components
│   ├── config.js        # Centralized configuration
│   ├── api-service.js   # HTTP API service layer
│   ├── event-manager.js # Event management system
│   ├── navbar.js        # Navigation component
│   ├── toast.js         # Toast notifications
│   ├── date-navigation.js # Date/week navigation
│   ├── expense-form.js  # Expense creation form
│   ├── expense-list.js  # Expense listing
│   └── category-chart.js # Chart visualization
├── styles/
│   └── theme.css        # Centralized styling
├── index.html           # Home page
└── expenses.html        # Main app page
```

## 🔧 **Core Modules**

### 1. **config.js** - Centralized Configuration
- **Purpose**: Single source of truth for all app configuration
- **Contains**:
  - API endpoints
  - Category definitions with colors and icons
  - Currency settings
  - UI constants
  - Validation rules
- **Benefits**: 
  - Easy to update categories or colors
  - No duplication across components
  - Type-safe configuration access

```javascript
// Example usage
import { CategoryHelper, CurrencyHelper } from './config.js';

const amount = CurrencyHelper.format(123.45); // "€123.45"
const categoryColor = CategoryHelper.getCategoryColor('food_drink'); // "#059669"
```

### 2. **api-service.js** - HTTP Service Layer
- **Purpose**: Centralized API communication
- **Features**:
  - Standardized error handling
  - Consistent request/response format
  - Automatic JSON parsing
  - HTTP status code handling
- **Benefits**:
  - DRY principle - no duplicate fetch logic
  - Consistent error handling across app
  - Easy to modify API behavior globally

```javascript
// Example usage
import { ApiService, ErrorHandler } from './api-service.js';

try {
    const expenses = await ApiService.getExpenses(month, year);
} catch (error) {
    ErrorHandler.handle(error, 'ExpenseList.loadExpenses');
}
```

### 3. **event-manager.js** - Event System
- **Purpose**: Structured component communication
- **Features**:
  - Centralized event types
  - Automatic cleanup with BaseComponent
  - Type-safe event emission
  - Global event management
- **Benefits**:
  - Loose coupling between components
  - Memory leak prevention
  - Predictable event flow

```javascript
// Example usage
import { EventManager, BaseComponent } from './event-manager.js';

// Emit events
EventManager.emitExpenseAdded(expense);

// Listen to events (with automatic cleanup)
this.listenToGlobalEvent('expenseadded', this.handleExpenseAdded.bind(this));
```

## 🎨 **Styling Architecture**

### **theme.css** - Centralized Styling
- **CSS Variables**: Dynamic theming with custom properties
- **Dark Mode**: Complete dark/light theme support
- **Component Styles**: All component-specific styles in one place
- **Responsive Design**: Mobile-first approach

```css
:root {
    --primary-bg: #ffffff;
    --text-color: #212529;
}

[data-bs-theme="dark"] {
    --primary-bg: #2b2b2b;
    --text-color: #e0e0e0;
}
```

## 🧩 **Component Architecture**

### **BaseComponent Class**
All components can extend `BaseComponent` for common functionality:
- Automatic event listener cleanup
- Global event management
- Common utilities (date formatting, error handling)

```javascript
class MyComponent extends BaseComponent {
    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Automatic cleanup when component disconnects
        this.listenToGlobalEvent('expenseadded', this.handleUpdate.bind(this));
    }
}
```

## 🔄 **Data Flow**

1. **User Action** → Component Event Handler
2. **API Call** → ApiService methods
3. **Event Emission** → EventManager.emit()
4. **Component Updates** → Automatic re-rendering
5. **Error Handling** → ErrorHandler.handle()

## 📋 **Maintenance Guidelines**

### **Adding New Categories**
1. Update `CONFIG.CATEGORIES` in `config.js`
2. Add CSS class in `theme.css` (`.badge.category-newname`)
3. Categories automatically appear in dropdowns

### **Adding New API Endpoints**
1. Add endpoint to `CONFIG.API.ENDPOINTS`
2. Add method to `ApiService` class
3. Use throughout app with consistent error handling

### **Adding New Events**
1. Add event type to `EventManager.EVENT_TYPES`
2. Create specific emitter method
3. Use in components with automatic cleanup

### **Styling Changes**
1. Use CSS variables when possible
2. Add both light and dark mode variants
3. Keep styles in `theme.css` for consistency

## 🚀 **Benefits of This Architecture**

1. **Maintainability**: Clear separation of concerns
2. **Scalability**: Easy to add new features
3. **Testability**: Isolated, pure functions
4. **Performance**: Efficient event management
5. **Developer Experience**: Predictable patterns
6. **Code Reuse**: Shared utilities and base classes

## 🔍 **Debugging**

- **Events**: Use browser dev tools to monitor custom events
- **API**: Check Network tab for API calls
- **Configuration**: Import config modules in console for debugging
- **Styling**: Use CSS custom property inspector

## 📝 **Migration Notes**

The refactoring maintains backward compatibility while introducing:
- ES6 modules for new core functionality
- Improved error handling
- Centralized configuration
- Better code organization
- Enhanced maintainability

Future components should follow this modular pattern for consistency. 