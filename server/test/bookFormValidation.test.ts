import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBookForm } from '../../client/src/utils/bookValidation.js';
const values = { title: 'Dracula', author: 'Bram Stoker', category: 'Literature', shelf: 'A-1', total: '2', year: '1897' };
test('frontend accepts complete book details and zero copies, but requires title, author and copies', () => {
  assert.deepEqual(validateBookForm(values, 0, true), {});
  assert.deepEqual(validateBookForm({ ...values, total: '0' }, 0, true), {});
  const errors = validateBookForm({ ...values, title: '  ', author: '', total: '' }, 0, true);
  assert.deepEqual(Object.keys(errors).sort(), ['author', 'title', 'total']);
});
test('frontend rejects fractional, negative, excessive, nonnumeric and missing copy counts', () => {
  for (const total of ['', ' ', '-1', '1.5', 'NaN', '1e3', '1000001']) assert.ok(validateBookForm({ ...values, total }, 0, true).total);
  assert.match(validateBookForm(values, 3, true).total, /3 copies are currently checked out/);
});
test('frontend enforces publication year and text lengths with readable field messages', () => {
  for (const year of ['', '0', '10000', '-1', '2026.5', 'abc', ' ']) assert.ok(validateBookForm({ ...values, year }, 0, true).year);
  assert.deepEqual(validateBookForm({ ...values, year: '9999' }, 0, true), {});
  assert.equal(Object.keys(validateBookForm({ ...values, title: 'x'.repeat(501), author: 'x'.repeat(501), category: 'x'.repeat(201), shelf: 'x'.repeat(201) }, 0, true)).length, 4);
});

test('frontend requires a picture on create and legacy edits, and accepts an existing picture', () => {
  assert.match(validateBookForm(values, 0, false).image, /Upload a cover image/);
  assert.deepEqual(validateBookForm(values, 0, true), {});
});

test('frontend requires category and shelf location with readable messages', () => {
  for (const key of ['category', 'shelf']) {
    for (const value of ['', '   ']) assert.ok(validateBookForm({ ...values, [key]: value }, 0, true)[key]);
  }
  assert.equal(validateBookForm({ ...values, category: '' }, 0, true).category, 'Select a category.');
});
