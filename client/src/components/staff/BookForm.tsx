import { useRef, useState, type FormEvent } from 'react';
import type { BookRecord } from '../../types/library';
import type { BookInput } from '../../services/library';
import { ApiError, apiBase } from '../../services/api';
import { BOOK_CATEGORIES } from '../../data/bookCategories';
import { Field, FormActions } from './StaffUI';

import { validateBookForm, type Values, type Errors } from '../../utils/bookValidation';

export function BookForm({ book, pending, onSave, onCancel }: {
  book: BookRecord | null; pending: boolean; onSave: (input: BookInput) => Promise<void>; onCancel: () => void;
}) {
  const [values, setValues] = useState<Values>(() => ({ title: book?.title ?? '', author: book?.author ?? '',
    category: book?.category ?? '', year: book?.year?.toString() ?? '', total: String(book?.total ?? 1), shelf: book?.shelf ?? '' }));
  const [image, setImage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const readVersion = useRef(0);
  const checkedOut = book ? book.total - book.available : 0;
  const existingImage = useRef(book?.hasImage ? apiBase + '/v1/books/' + encodeURIComponent(book.id) + '/image?v=' + Date.now() : '');
  const preview = image === undefined ? existingImage.current : image;
  function change(key: keyof Values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' })); setMessage('');
  }
  async function chooseImage(file?: File) {
    const version = ++readVersion.current;
    if (!file) { setReading(false); return; }
    setReading(true); setFileError(''); setErrors((current) => ({ ...current, image: '' })); setMessage('');
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
      if (file.size > 10 * 1024 * 1024) throw new Error('The image is too large. Choose a file up to 10 MB.');
      if (!file.size) throw new Error('This image file is empty. Choose another file.');
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The image could not be read. Choose the file again.'));
        reader.readAsDataURL(file);
      });
      const decoded = new Image(); decoded.src = result;
      await decoded.decode().catch(() => { throw new Error('This image could not be opened. Choose another JPEG, PNG, or WebP file.'); });
      if (version === readVersion.current) setImage(result);
    } catch (error) {
      if (version === readVersion.current) setFileError(error instanceof Error ? error.message : 'Choose another image.');
    } finally { if (version === readVersion.current) setReading(false); }
  }
  function resetImage() {
    ++readVersion.current; setReading(false); setImage(undefined); setFileError('');
    setErrors((current) => ({ ...current, image: '' })); setMessage('');
    if (fileInput.current) fileInput.current.value = '';
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || reading) return;
    const form = event.currentTarget;
    const problems = { ...validateBookForm(values, checkedOut, Boolean(preview)), ...(fileError && { image: fileError }) };
    setErrors(problems);
    if (Object.keys(problems).length) {
      setMessage('Please correct the highlighted book details.');
      (form.elements.namedItem(Object.keys(problems)[0]) as HTMLElement | null)?.focus();
      return;
    }
    setMessage('');
    try {
      await onSave({ title: values.title.trim(), author: values.author.trim(), category: values.category.trim(),
        shelf: values.shelf.trim(), year: Number(values.year), total: Number(values.total),
        ...(image !== undefined && { image }) });
    } catch (error) {
      const fields = error instanceof ApiError ? error.fields : {};
      setErrors(fields);
      setMessage(error instanceof Error ? error.message : 'The book could not be saved. Please try again.');
      (form.elements.namedItem(Object.keys(fields)[0]) as HTMLElement | null)?.focus();
    }
  }
  const labels: Record<keyof Values, string> = { title: 'Book title', author: 'Author', category: 'Category', year: 'Publication year', total: 'Total copies', shelf: 'Shelf location' };
  return <form className="staff-form" noValidate onSubmit={(event) => { void submit(event); }}>
    {message && <p role="alert" className="inline-warning">{message}</p>}
    <small className="field-hint">Fields marked * are required.</small>
    <fieldset className="workflow-fields" disabled={pending}>
      <div className="form-grid">{(Object.keys(labels) as Array<keyof Values>).map((key) => <Field key={key} label={labels[key] + ' *'}>
        {key === 'category' ? <select name="category" required value={values.category}
          aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'book-error-category' : undefined}
          onChange={(event) => change('category', event.target.value)}
          onBlur={() => setErrors((current) => ({ ...current, category: validateBookForm(values, checkedOut, Boolean(preview)).category ?? '' }))}>
          <option value="">Select a category</option>
          {values.category && !BOOK_CATEGORIES.some(category => category === values.category) && <option value={values.category}>{values.category} (existing category)</option>}
          {BOOK_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
        </select> : <input name={key} value={values[key]} required
          inputMode={key === 'year' || key === 'total' ? 'numeric' : undefined}
          aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? 'book-error-' + key : undefined}
          onChange={(event) => change(key, event.target.value)}
          onBlur={() => setErrors((current) => ({ ...current, [key]: validateBookForm(values, checkedOut, Boolean(preview))[key] ?? '' }))}/>}
        {errors[key] && <small className="field-error" id={'book-error-' + key}>{errors[key]}</small>}
      </Field>)}</div>
      <Field label="Cover image *">
        <input ref={fileInput} name="image" type="file" required={!book?.hasImage} accept="image/jpeg,image/png,image/webp"
          aria-invalid={Boolean(fileError || errors.image)} aria-describedby="book-image-help book-error-image"
          onClick={(event) => { event.currentTarget.value = ''; }} onChange={(event) => { void chooseImage(event.target.files?.[0]); }}/>
        <small id="book-image-help" className="field-hint">A cover image is required. JPEG, PNG, or WebP, up to 10 MB. Choose a new file to replace the current image.</small>
        <small className="field-error" id="book-error-image" role={fileError || errors.image ? 'alert' : undefined}>{fileError || errors.image}</small>
      </Field>
      {reading && <p role="status">Checking image...</p>}
      {preview && <div className="book-image-preview"><img src={preview} alt="Book cover preview"/></div>}
      {(image !== undefined || fileError) && <button type="button" className="staff-outline" onClick={resetImage}>{book?.hasImage ? 'Keep current image' : 'Clear image selection'}</button>}
      <FormActions onCancel={onCancel} pending={pending || reading} submit={book ? 'Save changes' : 'Add to catalog'}/>
    </fieldset>
  </form>;
}
