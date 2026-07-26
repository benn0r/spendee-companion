export type PaginationOptions = {
  defaultPageSize?: number;
  minPageSize?: number;
  maxPageSize?: number;
};

function finiteInteger(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function parsePagination(
  searchParams: URLSearchParams,
  {
    defaultPageSize = 25,
    minPageSize = 10,
    maxPageSize = 100,
  }: PaginationOptions = {},
) {
  const page = Math.max(1, finiteInteger(searchParams.get("page"), 1));
  const requestedPageSize = finiteInteger(searchParams.get("pageSize"), defaultPageSize);
  const pageSize = Math.min(maxPageSize, Math.max(minPageSize, requestedPageSize));
  return { page, pageSize };
}
