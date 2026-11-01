// Predicts how many days until a bin reaches 100% fill level

// 0     : bin is already full (>= 100)
// null  : can't predict (missing/invalid data, or rate <= 0)
// number of days (1 decimal) : otherwise

export function predictDaysUntilFull({current_fill_level, daily_fill_rate}) {
  // check null
  if (current_fill_level == null || daily_fill_rate == null) return null;

  // returns numerical columns as strings; convert
  const level = Math.max(0, Number(current_fill_level));
  const rate = Number(daily_fill_rate);

  if (!Number.isFinite(level) || !Number.isFinite(rate)) 
    return null;

  if (level >= 100) return 0;
  if (rate <= 0) return null;

  const days = (100 - level) / rate;
  return Math.round(days * 10) / 10;
}