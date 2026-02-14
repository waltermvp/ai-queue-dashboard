# React Native Coding Standards for AI Queue

## Critical Linting Rules (Prevent CI Failures)

### 1. NO INLINE STYLES
❌ **Wrong:**
```jsx
<View style={{ flex: 1, padding: 10 }}>
```

✅ **Correct:**
```jsx
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 }
});

<View style={styles.container}>
```

### 2. NO COLOR LITERALS  
❌ **Wrong:**
```jsx
backgroundColor: 'transparent'
backgroundColor: '#ffffff'  
```

✅ **Correct:**
```jsx
// Define in theme/colors or StyleSheet
const colors = {
  transparent: 'transparent',
  white: '#ffffff'
};
backgroundColor: colors.transparent
```

### 3. IMPORT ORDER (React First)
❌ **Wrong:**
```jsx
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
```

✅ **Correct:**
```jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
```

### 4. PRETTIER FORMATTING
❌ **Wrong:**
```jsx
const obj = {a: 1,b: 2,c: 3};
```

✅ **Correct:**
```jsx
const obj = {
  a: 1,
  b: 2,  
  c: 3,
};
```

### 5. REACT HOOKS DEPENDENCIES
❌ **Wrong:**
```jsx
useEffect(() => {
  doSomething(externalVar);
}, []); // Missing dependency
```

✅ **Correct:**
```jsx
useEffect(() => {
  doSomething(externalVar);
}, [externalVar]); // Include all dependencies
```

### 6. UNUSED IMPORTS
❌ **Wrong:**
```jsx
import React, { useState, useMemo } from 'react'; // useMemo not used
```

✅ **Correct:**
```jsx
import React, { useState } from 'react'; // Only import what's used
```

## AI Prompt Template

When generating React Native code, always:

1. **Use StyleSheet.create()** for all styles
2. **Import React first**, then third-party, then local modules  
3. **Format with proper line breaks** and trailing commas
4. **Include all dependencies** in useEffect/useCallback arrays
5. **Remove unused imports** and variables
6. **Use constants for colors** instead of literals

## Pre-Commit Checklist

Before creating PR:
- [ ] No inline styles (use StyleSheet)
- [ ] React imported before other packages
- [ ] All hook dependencies included  
- [ ] No unused imports
- [ ] Proper Prettier formatting
- [ ] No color literals (use theme/constants)

Run `npm run lint -- --fix` to auto-fix formatting issues.