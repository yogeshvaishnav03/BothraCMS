/**
 * Downloads a CSV string using a Blob + Object URL instead of a `data:text/csv`
 * URI, which avoids size truncation and prevents iOS/Android standalone PWAs
 * and WebViews from navigating into a dead-end `data:` document with no Back button.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const cleanCsv = csvContent.startsWith("data:text/csv")
    ? csvContent.replace(/^data:text\/csv[^,]*,/, "")
    : csvContent;

  const safeName = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob(["\uFEFF" + cleanCsv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Delay revocation so Android/iOS download managers complete reading the blob URL.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);
}
