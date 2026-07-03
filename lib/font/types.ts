export interface Point {
  x: number;
  y: number;
}

/** A single pen stroke as drawn by the user, in font units (y-up, origin at baseline). */
export type Stroke = Point[];

export interface OutlinePoint extends Point {
  onCurve: boolean;
}

/** A closed contour: a loop of outline points. Last point implicitly connects back to the first. */
export type Contour = OutlinePoint[];
