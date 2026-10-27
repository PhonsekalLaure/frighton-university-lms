export type Values = { title: string; author: string; category: string; year: string; total: string; shelf: string };
export type Errors = Record<string, string>;
export function validateBookForm(values: Values, checkedOut: number, hasImage = false): Errors {
  const errors: Errors = {};
  for (const [key, label, limit, required] of [
    ['title', 'Book title', 500, true], ['author', 'Author', 500, true],
    ['category', 'Category', 200, true], ['shelf', 'Shelf location', 200, true],
  ] as const) {
    if (required && !values[key].trim()) errors[key] = 'Enter the ' + label.toLowerCase() + '.';
    else if (values[key].trim().length > limit) errors[key] = label + ' must be ' + limit + ' characters or fewer.';
  }
  if (!/^[0-9]+$/.test(values.total) || Number(values.total) > 1000000) errors.total = 'Enter total copies as a whole number from 0 to 1,000,000.';
  else if (Number(values.total) < checkedOut) errors.total = 'At least ' + checkedOut + ' copies are currently checked out. Total copies cannot be lower.';
  if (!/^[0-9]+$/.test(values.year) || Number(values.year) < 1 || Number(values.year) > 9999) errors.year = 'Enter a publication year as a whole number from 1 to 9999.';
  if (!values.category.trim()) errors.category = 'Select a category.';
  if (!hasImage) errors.image = 'Upload a cover image for this book.';
  return errors;
}

