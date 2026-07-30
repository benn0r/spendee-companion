export const categoryIconIds = Array.from(
  { length: 58 },
  (_, index) => index + 1,
).filter((id) => id !== 47 && id !== 48);

export const defaultCategoryColor = "#1eadcf";

export type CategoryAppearance = {
  iconId: number | null;
  color: string;
};

export function validCategoryColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}
