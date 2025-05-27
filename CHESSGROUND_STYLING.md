# Chessground Styling Guidelines

## ⚠️ Critical Issue: Misaligned Square Highlights & Pieces

This is a **recurring problem** that happens when CSS interferes with chessground's internal positioning calculations. Pieces and square highlights (from/to squares) appear offset from their actual squares, especially noticeable in outer columns (G, H) and lower ranks (1, 2).

## 🚫 What NOT to Do

### 1. Never Override Chessground's Size Calculations
```scss
/* ❌ WRONG - These interfere with precise positioning */
.cg-wrap {
  width: 100% !important;
  height: 100% !important;
}

.cg-board {
  width: 100% !important;
  height: 100% !important;
}

.cg-board square {
  width: 12.5% !important;
  height: 12.5% !important;
}
```

### 2. Never Use `box-sizing: border-box` on Chessboard Elements
```scss
/* ❌ WRONG - Breaks chessground's calculations */
.chessboard-wrapper {
  box-sizing: border-box;
}

.chessboard-wrapper * {
  box-sizing: border-box;
}
```

### 3. Avoid Forced Positioning Overrides
```scss
/* ❌ WRONG - Can cause misalignment */
.cg-wrap {
  inset: 0 !important;
}
```

## ✅ What TO Do

### 1. Minimal CSS Interference
```scss
/* ✅ CORRECT - Let chessground handle its own sizing */
.cg-wrap {
  position: relative;
  display: block;
  /* No width/height overrides */
}

.cg-container {
  position: relative;
  display: block;
  /* No width/height overrides */
}

.cg-board {
  /* Let chessground handle its own sizing */
}
```

### 2. Clean Container Setup
```scss
/* ✅ CORRECT - Proper wrapper without interference */
.chessboard-wrapper {
  width: 100%;
  max-width: 550px;
  margin: auto;
  position: relative;
  /* NO box-sizing: border-box */
}

.chessboard-wrapper::before {
  content: '';
  display: block;
  padding-top: 100%; /* Maintain square aspect ratio */
  margin: 0;
}

.chessboard-wrapper > .cg-wrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 0;
}
```

### 3. Reset Inherited Styles
```scss
/* ✅ CORRECT - Reset problematic inheritance */
.chessboard-wrapper .cg-wrap,
.chessboard-wrapper .cg-container,
.chessboard-wrapper .cg-board {
  margin: 0;
  padding: 0;
}

.chessboard-wrapper * {
  box-sizing: content-box; /* Override any border-box inheritance */
}
```

## 🔧 Common Fix Pattern

When square highlights are misaligned:

1. **Check for `box-sizing: border-box`** anywhere in the chessboard hierarchy
2. **Remove width/height overrides** on chessground elements
3. **Ensure clean margin/padding reset** on all chessboard containers
4. **Use explicit top/left/right/bottom** instead of `inset: 0`

## 🧪 Testing Alignment

To verify the fix is working:

1. **Place pieces in outer columns** (G, H files)
2. **Check lower ranks** (1st, 2nd ranks) 
3. **Make moves and verify highlights** align perfectly with squares
4. **Test on different screen sizes** to ensure responsive behavior

## 📝 Why This Happens

- **Chessground calculates positions** based on precise board measurements
- **CSS interference** throws off these calculations by tiny amounts (usually 1-3px)
- **The error compounds** toward outer edges of the board
- **Modern CSS features** like `box-sizing: border-box` and grid/flex can interfere

## 🎯 Quick Checklist

When working on chess UI:

- [ ] No `box-sizing: border-box` on chessboard elements
- [ ] No width/height overrides with `!important`
- [ ] Clean margin/padding reset on containers  
- [ ] Let chessground handle its own sizing
- [ ] Test piece alignment in outer squares
- [ ] Verify highlight alignment on moves

## 🔄 If You Break It

1. **Remove all custom sizing** from chessground elements
2. **Reset to minimal CSS** approach shown above
3. **Test alignment** before adding new styles
4. **Add styles incrementally** and test after each change

---

**Remember**: Chessground is designed to handle its own positioning precisely. Our job is to provide a clean container and stay out of its way!