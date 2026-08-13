import {
  defaultCategoryColor,
  type CategoryAppearance,
} from "@/lib/category-appearance";
import { assetUrl } from "@/lib/assets";

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
      {appearance?.iconId ? (
        <img
          alt=""
          aria-hidden="true"
          src={assetUrl(`/category-icons/cat_${appearance.iconId}.svg`)}
        />
      ) : (
        <b aria-hidden="true">#</b>
      )}
    </span>
  );
}
