export function getSafeExternalUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl.trim());

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}
