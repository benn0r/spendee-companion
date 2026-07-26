export const BUILD_ID = (process.env.NEXT_PUBLIC_APP_VERSION || "dev").slice(0, 7);

export function assetUrl(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(BUILD_ID)}`;
}
