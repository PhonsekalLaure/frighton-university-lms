-- Seed initial library book collection
INSERT INTO public.books (isbn, title, author, category, total_copies, available_copies)
VALUES
    ('978-0143105954', 'Frankenstein; or, The Modern Prometheus', 'Mary Shelley', 'Gothic Literature', 5, 4),
    ('978-0486272788', 'Dracula (Unabridged Edition)', 'Bram Stoker', 'Classic Horror', 4, 2),
    ('978-0262033848', 'Introduction to Algorithms (4th Edition)', 'Thomas H. Cormen et al.', 'Computer Science', 8, 6),
    ('978-0062059888', 'Grimoire of Frighton Valley (Restricted Archive)', 'Archivist M. Blackwood', 'Rare Manuscripts', 1, 1),
    ('978-0132350884', 'Clean Code: A Handbook of Agile Software Craftsmanship', 'Robert C. Martin', 'Software Engineering', 6, 5)
ON CONFLICT (isbn) DO NOTHING;
