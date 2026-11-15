export const DEMO_SEED = 'frighton-demo-v1';
export const DEMO_PASSWORD = 'Password123!';
export const demoStaff = [
  { key: 'admin', email: 'admin@frighton.com', first_name: 'Alex', last_name: 'Morgan', role: 'Admin' },
  { key: 'librarian1', email: 'librarian1@frighton.com', first_name: 'Mina', last_name: 'Reyes', role: 'Librarian' },
  { key: 'librarian2', email: 'librarian2@frighton.com', first_name: 'Elias', last_name: 'Cruz', role: 'Librarian' },
] as const;

// Original sample textbooks and public-domain classics, each with a bundled cover.
const titles = [
  ['frankenstein', 'Frankenstein', 'Mary Shelley', 'Fiction', 'Lackington, Hughes, Harding, Mavor & Jones', 1818, 5, 'FIC-01', 'A classic novel about scientific ambition, creation, and responsibility.'],
  ['dracula', 'Dracula', 'Bram Stoker', 'Literature', 'Archibald Constable and Company', 1897, 4, 'LIT-01', 'A Gothic novel told through journals, letters, and newspaper accounts.'],
  ['computing', 'Foundations of Computing', 'Ada Reyes', 'Computer Science', 'Frighton Learning Press', 2024, 6, 'CS-01', 'Sample textbook introducing algorithms, data structures, and computational thinking.'],
  ['mathematics', 'Mathematics for Everyday Problems', 'Leo Santos', 'Mathematics', 'Frighton Learning Press', 2023, 5, 'MAT-01', 'Sample textbook covering algebra, geometry, and practical problem solving.'],
  ['science', 'Discovering the Natural World', 'Clara Bellamy', 'Science', 'Frighton Learning Press', 2024, 7, 'SCI-01', 'Sample introduction to scientific inquiry, ecosystems, and the physical world.'],
  ['history', 'World History: People and Places', 'Noah Ashford', 'History', 'Frighton Learning Press', 2022, 4, 'HIS-01', 'Sample survey of civilizations, cultural exchange, and historical evidence.'],
  ['business', 'Principles of Small Business', 'Iris Blackwood', 'Business & Economics', 'Frighton Learning Press', 2025, 6, 'BUS-01', 'Sample guide to planning, accounting, marketing, and business decisions.'],
  ['arts', 'An Introduction to Visual Arts', 'Maeve Fairchild', 'Arts & Design', 'Frighton Learning Press', 2023, 3, 'ART-01', 'Sample guide to composition, color, drawing, and visual interpretation.'],
  ['philosophy', 'Questions in Philosophy', 'Theo Whitlock', 'Philosophy', 'Frighton Learning Press', 2024, 4, 'PHI-01', 'Sample reader exploring ethics, knowledge, reasoning, and human experience.'],
  ['engineering', 'Engineering Design Essentials', 'Victor Northwood', 'Engineering', 'Frighton Learning Press', 2025, 5, 'ENG-01', 'Sample introduction to design, prototyping, materials, and technical communication.'],
] as const;

export const demoBooks = titles.map(([key, title, author, category, publisher, publication_year, copies, shelf_location, description], index) => ({
  key, books_id: 'f1170000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
  title, author, category, publisher, publication_year, copies, shelf_location, description,
  cover_image_path: DEMO_SEED + '/' + key + '.png',
}));
