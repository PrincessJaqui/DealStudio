/** Minimal event shape used by the availability calendar in the deal studio. */
export interface Event {
  id: string;
  name: string;
  date: string;
  [key: string]: any;
}
