alter table public.collections
  add column color text check (color ~* '^#[0-9a-f]{6}$'),
  add column symbol text check (symbol in (
    'flask', 'moon', 'feather', 'leaf', 'flame', 'compass', 'anchor',
    'cloud', 'music', 'key', 'sun', 'gem', 'flower', 'telescope',
    'book', 'reading', 'bookmark', 'heart', 'check', 'cross', 'library'
  ));
