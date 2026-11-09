export type RoomNote = {
  id: string;
  clientId?: string;
  text: string;
  at: string;
  by: string;
  authorName: string;
};
export declare const NOTE_TEXT_MAX: number;
export declare const NOTES_PER_ROOM_MAX: number;
export declare const CLIENT_ID_PATTERN: RegExp;
export declare function isClientId(value: unknown): value is string;
export declare function cleanNoteText(value: unknown): string;
export declare function noteRows(obj: unknown): RoomNote[];
