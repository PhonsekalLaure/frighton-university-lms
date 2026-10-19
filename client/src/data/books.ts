export type Book = {
  id: number;
  title: string;
  author: string;
  category: string;
  year: number;
  copies: number;
  totalCopies: number;
  description: string;
  initials: string;
  color: string;
  shelf: string;
};

export const books: Book[] = [
  { id: 1, title: 'The Creative Act', author: 'Rick Rubin', category: 'Arts & Design', year: 2023, copies: 3, totalCopies: 5, description: 'A thoughtful guide to the creative process, inviting readers to find inspiration in everyday life and bring their ideas into the world.', initials: 'CA', color: 'coral', shelf: 'Arts · 700 R89' },
  { id: 2, title: 'A Brief History of Time', author: 'Stephen Hawking', category: 'Science', year: 1998, copies: 0, totalCopies: 4, description: 'A landmark exploration of cosmology, black holes, and the nature of time, written for curious readers everywhere.', initials: 'HT', color: 'blue', shelf: 'Science · 523.1 H39' },
  { id: 3, title: 'The Design of Everyday Things', author: 'Don Norman', category: 'Arts & Design', year: 2013, copies: 2, totalCopies: 3, description: 'A classic look at how thoughtful design makes the objects and systems around us easier to understand and use.', initials: 'DT', color: 'ochre', shelf: 'Arts · 745.2 N84' },
  { id: 4, title: 'Braiding Sweetgrass', author: 'Robin Wall Kimmerer', category: 'Environment', year: 2013, copies: 1, totalCopies: 3, description: 'Indigenous wisdom, scientific knowledge, and the teachings of plants come together in an illuminating meditation on our relationship with the natural world.', initials: 'BS', color: 'green', shelf: 'Environment · 305.8 K49' },
  { id: 5, title: 'Educated', author: 'Tara Westover', category: 'Memoir', year: 2018, copies: 4, totalCopies: 4, description: 'A memoir about growing up in a strict and isolated household and finding an education that opens a new world.', initials: 'ED', color: 'plum', shelf: 'Biography · 270.9 W52' },
  { id: 6, title: 'The Pragmatic Programmer', author: 'David Thomas & Andrew Hunt', category: 'Technology', year: 2019, copies: 2, totalCopies: 4, description: 'Practical advice for building better software and growing as a thoughtful, adaptable programmer.', initials: 'PP', color: 'navy', shelf: 'Technology · 005.1 T46' },
  { id: 7, title: 'Crying in H Mart', author: 'Michelle Zauner', category: 'Memoir', year: 2021, copies: 0, totalCopies: 2, description: 'A moving memoir of family, food, grief, and the search for identity across cultures.', initials: 'HM', color: 'rose', shelf: 'Biography · 641.5 Z39' },
  { id: 8, title: 'The Hidden Life of Trees', author: 'Peter Wohlleben', category: 'Environment', year: 2016, copies: 2, totalCopies: 3, description: 'A forest ranger reveals the surprising ways trees communicate, care for one another, and shape their communities.', initials: 'TL', color: 'forest', shelf: 'Environment · 582.16 W64' },
];
