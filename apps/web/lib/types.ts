// Shared frontend types — mirror of the BFF's JSON shapes (BFF remains authoritative).

export interface User {
  id: string;
  email: string;
  preferred_mode: string;
  label_pack: string | null;
}
