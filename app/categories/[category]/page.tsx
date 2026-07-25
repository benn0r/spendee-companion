import CategoryDetails from "./CategoryDetails";

export default async function CategoryPage(
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  return <CategoryDetails category={category} />;
}
