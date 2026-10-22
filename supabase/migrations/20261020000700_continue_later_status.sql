-- Commit the enum addition before functions or writes use the new value.
alter type public.reading_status add value 'continue_later' after 'reading';
