export const getTimeFilterLabel = (value: string): '年份' | '月份' => (
  /^\d{4}$/.test(value.trim()) ? '年份' : '月份'
);
