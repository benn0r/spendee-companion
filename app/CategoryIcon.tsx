import {
  categoryIonicon,
  defaultCategoryColor,
  type CategoryAppearance,
} from "@/lib/category-appearance";
import Ionicon from "@/app/Ionicon";

export default function CategoryIcon({
  appearance,
  className = "category-icon",
}: {
  appearance?: CategoryAppearance;
  className?: string;
}) {
  const color = appearance?.color ?? defaultCategoryColor;
  return (
    <span className={className} style={{ backgroundColor: color }}>
      <Ionicon name={categoryIonicon(appearance?.iconId)} />
    </span>
  );
}
